import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, lstat, mkdir, mkdtemp, realpath, readFile, symlink, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvalCatalogV1 } from '@relayer/eval-runner';

const execFile = promisify(execFileCallback);
// Node caches transitive ESM imports by URL. A new catalog pin at the same
// path needs a fresh process; a query string on the entrypoint is insufficient.
const importedCheckoutIdentities = new Map();
const verifiedSnapshots = new Map();
const snapshotRoots = new Set();
const digest = (value) => createHash('sha256').update(value).digest('hex');

process.once('exit', () => {
  for (const root of snapshotRoots) rmSync(root, { recursive: true, force: true });
});

export async function loadExternalEvalCatalog({ repositoryDirectory, lock }) {
  validateLock(lock);
  const root = await realpath(repositoryDirectory);
  const inspected = await inspectCheckout(root, lock, true);
  const identity = inspected.identity;
  const previousIdentity = importedCheckoutIdentities.get(root);
  if (previousIdentity && previousIdentity !== canonicalIdentity(identity)) {
    throw new Error('External catalog pin changed at an already imported path; restart the Eval host to load the new checkout.');
  }
  // Remember attempted imports too: a failed factory can leave dependencies cached.
  importedCheckoutIdentities.set(root, canonicalIdentity(identity));
  const entry = await verifiedSnapshot(root, identity, inspected.files);
  const module = await import(pathToFileURL(entry).href);
  if (typeof module.createEvalCatalog !== 'function') throw new Error('Pinned catalog entrypoint must export createEvalCatalog().');
  const catalog = validateEvalCatalogV1(await module.createEvalCatalog());
  const afterImport = await inspectCheckout(root, lock);
  if (canonicalIdentity(identity) !== canonicalIdentity(afterImport)) throw new Error('Pinned evaluation catalog checkout changed while it was being loaded.');
  return Object.freeze({
    ...catalog,
    identity: Object.freeze(identity),
    assertUnchanged: async () => {
      const current = await inspectCheckout(root, lock);
      if (canonicalIdentity(identity) !== canonicalIdentity(current)) throw new Error('Pinned evaluation catalog checkout identity changed.');
    },
  });
}

function validateLock(lock) {
  if (!lock || lock.schemaVersion !== 1 || typeof lock.repositoryUrl !== 'string' || !lock.repositoryUrl.trim() || typeof lock.entrypoint !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(lock.commit)) throw new Error('Invalid external evaluation catalog lock.');
  if (path.isAbsolute(lock.entrypoint) || lock.entrypoint.includes('\\') || lock.entrypoint.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Catalog entrypoint must be a normalized repository-relative path.');
}
async function git(root, ...args) {
  // Inspect this checkout's real objects, independent of caller Git overrides.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const { stdout } = await execFile('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], { cwd: root, env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function inspectCheckout(root, lock, captureFiles = false) {
  const [replacements, graftPath] = await Promise.all([
    git(root, 'for-each-ref', '--format=%(refname)', 'refs/replace/'),
    git(root, 'rev-parse', '--path-format=absolute', '--git-path', 'info/grafts'),
  ]);
  if (replacements) throw new Error('External catalog cannot contain Git replacement refs.');
  try {
    await lstat(graftPath);
    throw new Error('External catalog cannot contain Git grafts.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const [head, tree, remote, staged, untracked, listing] = await Promise.all([
    git(root, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'HEAD^{tree}'), git(root, 'remote', 'get-url', 'origin'),
    // Compare index objects only. Worktree status can execute local clean filters;
    // tracked worktree bytes are checked directly below without Git conversions.
    git(root, 'diff', '--cached', '--name-status', '--no-ext-diff', '--no-textconv', 'HEAD'),
    git(root, 'ls-files', '--others', '--exclude-standard'), git(root, 'ls-tree', '-r', '-z', '--full-tree', 'HEAD'),
  ]);
  if (head.toLowerCase() !== lock.commit.toLowerCase()) throw new Error(`External catalog HEAD mismatch: expected ${lock.commit}, received ${head}.`);
  if (remote !== lock.repositoryUrl) throw new Error(`External catalog origin mismatch: expected ${lock.repositoryUrl}, received ${remote}.`);
  if (staged || untracked) throw new Error(`External catalog checkout is not clean: ${(staged || untracked).split('\n')[0]}`);
  const entries = listing.split('\0').filter(Boolean).map((record) => {
    const match = /^(\d+) (blob|commit) ([0-9a-f]+)\t(.*)$/.exec(record);
    if (!match) throw new Error('Unable to inspect tracked external catalog files.');
    return { mode: match[1], type: match[2], oid: match[3], file: match[4] };
  });
  const files = [];
  for (const entry of entries) {
    if (entry.type !== 'blob' || (entry.mode !== '100644' && entry.mode !== '100755')) throw new Error(`External catalog contains unsupported tracked file mode: ${entry.file}`);
    const full = await resolveCommittedEntry(root, entry.file);
    const bytes = await readFile(full);
    const objectHash = createHash(entry.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (objectHash !== entry.oid) throw new Error(`External catalog tracked bytes differ from pinned Git content: ${entry.file}`);
    files.push({ ...entry, bytes });
  }
  const entry = entries.find(({ file }) => file === lock.entrypoint);
  if (!entry) throw new Error('Catalog entrypoint must be a tracked regular file.');
  const entryBytes = files.find(({ file }) => file === lock.entrypoint).bytes;
  const identity = { schemaVersion: 1, repositoryUrl: remote, commit: head, tree, entrypoint: lock.entrypoint, entrypointSha256: digest(entryBytes) };
  return captureFiles ? { identity, files } : identity;
}
async function verifiedSnapshot(root, identity, files) {
  const key = `${root}\0${canonicalIdentity(identity)}`;
  const existing = verifiedSnapshots.get(key);
  if (existing) return existing;
  const creation = createVerifiedSnapshot(root, identity, files);
  verifiedSnapshots.set(key, creation);
  try {
    return await creation;
  } catch (error) {
    verifiedSnapshots.delete(key);
    throw error;
  }
}
async function createVerifiedSnapshot(root, identity, files) {
  const snapshotRoot = await mkdtemp(path.join(tmpdir(), 'relayer-eval-catalog-'));
  snapshotRoots.add(snapshotRoot);
  try {
    for (const file of files) {
      const destination = path.join(snapshotRoot, file.file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes, { mode: file.mode === '100755' ? 0o500 : 0o400 });
      await chmod(destination, file.mode === '100755' ? 0o500 : 0o400);
    }
    try {
      const dependencyRoot = await realpath(path.join(root, 'node_modules'));
      await symlink(dependencyRoot, path.join(snapshotRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const entry = path.join(snapshotRoot, identity.entrypoint);
    return entry;
  } catch (error) {
    rmSync(snapshotRoot, { recursive: true, force: true });
    snapshotRoots.delete(snapshotRoot);
    throw error;
  }
}
async function resolveCommittedEntry(root, entrypoint) {
  const full = path.resolve(root, entrypoint);
  const actual = await realpath(full);
  if (actual !== full || !actual.startsWith(`${root}${path.sep}`)) throw new Error('Catalog entrypoint cannot use symlinks or escape its repository.');
  const info = await lstat(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Catalog entrypoint must be a regular file.');
  return full;
}
function canonicalIdentity(identity) { return JSON.stringify(identity, Object.keys(identity).sort()); }
