import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvalCatalogV1 } from '@relayer/eval-runner';

const execFile = promisify(execFileCallback);
// Node caches transitive ESM imports by URL. A new catalog pin at the same
// path needs a fresh process; a query string on the entrypoint is insufficient.
const importedCheckoutIdentities = new Map();
const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function loadExternalEvalCatalog({ repositoryDirectory, lock }) {
  validateLock(lock);
  const root = await realpath(repositoryDirectory);
  const identity = await inspectCheckout(root, lock);
  const previousIdentity = importedCheckoutIdentities.get(root);
  if (previousIdentity && previousIdentity !== canonicalIdentity(identity)) {
    throw new Error('External catalog pin changed at an already imported path; restart the Eval host to load the new checkout.');
  }
  // Remember attempted imports too: a failed factory can leave dependencies cached.
  importedCheckoutIdentities.set(root, canonicalIdentity(identity));
  const entry = await resolveCommittedEntry(root, lock.entrypoint);
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
  const { stdout } = await execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function inspectCheckout(root, lock) {
  const [head, tree, remote, status, listing] = await Promise.all([
    git(root, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'HEAD^{tree}'), git(root, 'remote', 'get-url', 'origin'),
    git(root, 'status', '--porcelain=v1', '--untracked-files=all'), git(root, 'ls-tree', '-r', '-z', '--full-tree', 'HEAD'),
  ]);
  if (head.toLowerCase() !== lock.commit.toLowerCase()) throw new Error(`External catalog HEAD mismatch: expected ${lock.commit}, received ${head}.`);
  if (remote !== lock.repositoryUrl) throw new Error(`External catalog origin mismatch: expected ${lock.repositoryUrl}, received ${remote}.`);
  if (status) throw new Error(`External catalog checkout is not clean: ${status.split('\n')[0]}`);
  const entries = listing.split('\0').filter(Boolean).map((record) => {
    const match = /^(\d+) (blob|commit) ([0-9a-f]+)\t(.*)$/.exec(record);
    if (!match) throw new Error('Unable to inspect tracked external catalog files.');
    return { mode: match[1], type: match[2], oid: match[3], file: match[4] };
  });
  for (const entry of entries) {
    if (entry.type !== 'blob' || (entry.mode !== '100644' && entry.mode !== '100755')) throw new Error(`External catalog contains unsupported tracked file mode: ${entry.file}`);
    const full = await resolveCommittedEntry(root, entry.file);
    const bytes = await readFile(full);
    const objectHash = createHash(entry.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (objectHash !== entry.oid) throw new Error(`External catalog tracked bytes differ from pinned Git content: ${entry.file}`);
  }
  const entry = entries.find(({ file }) => file === lock.entrypoint);
  if (!entry) throw new Error('Catalog entrypoint must be a tracked regular file.');
  const entryPath = await resolveCommittedEntry(root, lock.entrypoint);
  return { schemaVersion: 1, repositoryUrl: remote, commit: head, tree, entrypoint: lock.entrypoint, entrypointSha256: digest(await readFile(entryPath)) };
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
