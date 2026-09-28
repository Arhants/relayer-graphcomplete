import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadExternalEvalCatalog } from './external-catalog.mjs';

const roots = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(valid = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'external-eval-catalog-'));
  roots.push(root);
  const run = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 'test@example.invalid');
  run('config', 'user.name', 'Eval Catalog Test');
  run('remote', 'add', 'origin', 'https://example.invalid/catalog.git');
  await writeFile(path.join(root, 'catalog-data.mjs'), `export const valid=${valid}\n`);
  await writeFile(path.join(root, 'index.mjs'), "import {valid} from './catalog-data.mjs'; export async function createEvalCatalog(){if(!valid)throw Error();return {schemaVersion:1,cases:[],suites:[]}}\n");
  run('add', 'index.mjs', 'catalog-data.mjs'); run('commit', '-qm', 'fixture');
  return { root, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
}
const lockFor = ({ commit }) => ({ schemaVersion: 1, repositoryUrl: 'https://example.invalid/catalog.git', commit, entrypoint: 'index.mjs' });

describe('pinned external evaluation catalog loader', () => {
  it('removes a private snapshot when construction fails', async () => {
    const repo = await fixture();
    await writeFile(path.join(repo.root, 'node_modules'), 'not a dependency directory');
    execFileSync('git', ['add', 'node_modules'], { cwd: repo.root });
    execFileSync('git', ['commit', '-qm', 'invalid dependencies'], { cwd: repo.root });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.root, encoding: 'utf8' }).trim();
    const snapshots = await mkdtemp(path.join(tmpdir(), 'isolated-catalog-snapshots-'));
    roots.push(snapshots);
    for (const name of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(name, snapshots);
    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor({ commit }) })).rejects.toThrow();
    expect(await readdir(snapshots)).toEqual([]);
  });
  it('does not execute checkout-local filesystem monitors or clean filters during inspection', async () => {
    const repo = await fixture();
    const git = (...args) => execFileSync('git', args, { cwd: repo.root, encoding: 'utf8' }).trim();
    await writeFile(path.join(repo.root, '.gitattributes'), '*.mjs filter=untrusted\n');
    git('add', '.gitattributes'); git('commit', '-qm', 'attributes');
    const marker = path.join(repo.root, '.git', 'verification-command-executed');
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
    const command = `${quote(process.execPath)} -e ${quote(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`)}`;
    git('config', 'core.fsmonitor', command);
    git('config', 'filter.untrusted.clean', command);
    const commit = git('rev-parse', 'HEAD');
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor({ commit }) });
    await catalog.assertUnchanged();
    await expect(access(marker)).rejects.toThrow();
  });
  it('does not allow inherited Git environment to redirect checkout validation', async () => {
    const repo = await fixture();
    vi.stubEnv('GIT_DIR', path.join(repo.root, 'missing-git-directory'));
    vi.stubEnv('GIT_REPLACE_REF_BASE', 'refs/alternate-replacements/');
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    expect(catalog.identity.commit).toBe(repo.commit);
    await catalog.assertUnchanged();
  });
  it('rejects a checkout switched to alternate transitive code after resolving HEAD', async () => {
    const repo = await fixture();
    const pinned = repo.commit;
    const marker = path.join(repo.root, '.alternate-module-executed');
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), `
      import {writeFileSync} from 'node:fs';
      import {execFileSync} from 'node:child_process';
      writeFileSync(${JSON.stringify(marker)}, 'executed');
      execFileSync(${JSON.stringify(realGit)}, ['checkout', '--detach', ${JSON.stringify(pinned)}], {cwd:${JSON.stringify(repo.root)},stdio:'ignore'});
      export const valid=true;
    `);
    execFileSync(realGit, ['add', 'catalog-data.mjs'], { cwd: repo.root });
    execFileSync(realGit, ['commit', '-qm', 'alternate transitive code'], { cwd: repo.root });
    const alternate = execFileSync(realGit, ['rev-parse', 'HEAD'], { cwd: repo.root, encoding: 'utf8' }).trim();
    execFileSync(realGit, ['checkout', '--detach', pinned], { cwd: repo.root, stdio: 'ignore' });

    const bin = await mkdtemp(path.join(tmpdir(), 'catalog-git-wrapper-'));
    roots.push(bin);
    await writeFile(path.join(bin, 'git'), `#!/usr/bin/env node
      const {spawnSync}=require('node:child_process');
      const args=process.argv.slice(2);
      const command=args.slice(3);
      const result=spawnSync(${JSON.stringify(realGit)}, args, {encoding:'utf8'});
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      if(result.status === 0 && command[0] === 'rev-parse' && command[1] === 'HEAD') {
        const switched=spawnSync(${JSON.stringify(realGit)}, ['checkout','--detach',${JSON.stringify(alternate)}], {cwd:${JSON.stringify(repo.root)},stdio:'ignore'});
        if(switched.status !== 0) process.exit(switched.status ?? 1);
      }
      process.exit(result.status ?? 1);
    `, { mode: 0o700 });
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`);

    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) })).rejects.toThrow(/not clean|tracked bytes differ/);
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects replacement objects even when HEAD and status conceal different imported bytes', async () => {
    const repo = await fixture(false);
    const git = (...args) => execFileSync('git', args, { cwd: repo.root, encoding: 'utf8' }).trim();
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), 'export const valid=true\n');
    git('add', 'catalog-data.mjs'); git('commit', '-qm', 'replacement');
    const replacement = git('rev-parse', 'HEAD');
    git('replace', repo.commit, replacement);
    git('checkout', '--detach', repo.commit);
    expect(git('rev-parse', 'HEAD')).toBe(repo.commit);
    expect(git('status', '--porcelain')).toBe('');
    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) })).rejects.toThrow('replacement refs');
  });
  it('rejects replacement refs and grafts added after loading', async () => {
    const repo = await fixture();
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    const git = (...args) => execFileSync('git', args, { cwd: repo.root, encoding: 'utf8' }).trim();
    const replacement = git('commit-tree', 'HEAD^{tree}', '-m', 'replacement');
    git('replace', repo.commit, replacement);
    await expect(catalog.assertUnchanged()).rejects.toThrow('replacement refs');
    git('replace', '-d', repo.commit);
    await writeFile(git('rev-parse', '--path-format=absolute', '--git-path', 'info/grafts'), `${repo.commit}\n`);
    await expect(catalog.assertUnchanged()).rejects.toThrow('Git grafts');
  });
  it('loads only an exact clean pinned checkout and rechecks it on demand', async () => {
    const repo = await fixture();
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    expect(catalog.identity).toMatchObject({ repositoryUrl: 'https://example.invalid/catalog.git', commit: repo.commit, entrypoint: 'index.mjs' });
    expect(catalog.cases).toEqual([]);
    await catalog.assertUnchanged();
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), 'export const valid=false\n');
    await expect(catalog.assertUnchanged()).rejects.toThrow('tracked bytes differ from pinned Git content');
  });
  it('detects committed-byte mutation even when Git is told to assume the file is unchanged', async () => {
    const repo = await fixture();
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    execFileSync('git', ['update-index', '--assume-unchanged', 'catalog-data.mjs'], { cwd: repo.root });
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), 'export const valid=false\n');
    await expect(catalog.assertUnchanged()).rejects.toThrow('tracked bytes differ from pinned Git content');
  });
  it.each([true, false])('requires a restart after a pin change even when initial factory success is %s', async (initiallyValid) => {
    const repo = await fixture(initiallyValid);
    const initialLoad = loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    if (initiallyValid) await initialLoad;
    else await expect(initialLoad).rejects.toThrow();
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), `export const valid=${!initiallyValid}\n`);
    execFileSync('git', ['add', 'catalog-data.mjs'], { cwd: repo.root });
    execFileSync('git', ['commit', '-qm', 'new catalog pin'], { cwd: repo.root });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.root, encoding: 'utf8' }).trim();
    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor({ commit }) })).rejects.toThrow('restart the Eval host');
  });
  it('rejects dirty checkouts, wrong commits, wrong origins, and nontracked entrypoints', async () => {
    const repo = await fixture();
    await writeFile(path.join(repo.root, 'index.mjs'), '\n');
    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) })).rejects.toThrow('tracked bytes differ from pinned Git content');
    const fresh = await fixture();
    await expect(loadExternalEvalCatalog({ repositoryDirectory: fresh.root, lock: { ...lockFor(fresh), commit: '0'.repeat(40) } })).rejects.toThrow('HEAD mismatch');
    await expect(loadExternalEvalCatalog({ repositoryDirectory: fresh.root, lock: { ...lockFor(fresh), repositoryUrl: 'https://wrong.invalid/catalog.git' } })).rejects.toThrow('origin mismatch');
    await expect(loadExternalEvalCatalog({ repositoryDirectory: fresh.root, lock: { ...lockFor(fresh), entrypoint: 'missing.mjs' } })).rejects.toThrow('entrypoint must be a tracked regular file');
    const linked = await fixture();
    await rm(path.join(linked.root, 'index.mjs'));
    await symlink('catalog-data.mjs', path.join(linked.root, 'index.mjs'));
    execFileSync('git', ['add', 'index.mjs'], { cwd: linked.root });
    execFileSync('git', ['commit', '-qm', 'symlink entrypoint'], { cwd: linked.root });
    const linkedLock = { ...lockFor(linked), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: linked.root, encoding: 'utf8' }).trim() };
    await expect(loadExternalEvalCatalog({ repositoryDirectory: linked.root, lock: linkedLock })).rejects.toThrow('unsupported tracked file mode: index.mjs');
  });
  it('imports the verified snapshot when catalog code mutates a live sibling during factory execution', async () => {
    const repo = await fixture();
    const liveData = path.join(repo.root, 'catalog-data.mjs');
    const marker = path.join(repo.root, '.poisoned-module-executed');
    const original = 'export const valid=true\n';
    const poisoned = `import {writeFile} from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, 'executed'); export const valid=true\n`;
    await writeFile(path.join(repo.root, 'index.mjs'), `
      import {writeFile} from 'node:fs/promises';
      export async function createEvalCatalog(){
        await writeFile(${JSON.stringify(liveData)}, ${JSON.stringify(poisoned)});
        try {
          const {valid}=await import('./catalog-data.mjs?live-race');
          if(!valid)throw Error();
          return {schemaVersion:1,cases:[],suites:[]};
        } finally {
          await writeFile(${JSON.stringify(liveData)}, ${JSON.stringify(original)});
        }
      }
    `);
    execFileSync('git', ['add', 'index.mjs'], { cwd: repo.root });
    execFileSync('git', ['commit', '-qm', 'race fixture'], { cwd: repo.root });
    repo.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.root, encoding: 'utf8' }).trim();

    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    expect(catalog.cases).toEqual([]);
    expect(await readFile(liveData, 'utf8')).toBe(original);
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('makes snapshot directories non-writable before catalog code can replace a sibling', async () => {
    const repo = await fixture();
    await writeFile(path.join(repo.root, 'index.mjs'), `
      import {rm,writeFile} from 'node:fs/promises';
      export async function createEvalCatalog(){
        const sibling=new URL('./catalog-data.mjs', import.meta.url);
        try {
          await rm(sibling);
          await writeFile(sibling, 'export const valid=false\\n');
          throw new Error('snapshot directory was writable');
        } catch(error) {
          if(error.message === 'snapshot directory was writable') throw error;
          if(error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
        }
        const {valid}=await import('./catalog-data.mjs?locked-directory');
        if(!valid)throw Error();
        return {schemaVersion:1,cases:[],suites:[]};
      }
    `);
    execFileSync('git', ['add', 'index.mjs'], { cwd: repo.root });
    execFileSync('git', ['commit', '-qm', 'snapshot directory fixture'], { cwd: repo.root });
    repo.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.root, encoding: 'utf8' }).trim();

    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    expect(catalog.cases).toEqual([]);
  });
});
