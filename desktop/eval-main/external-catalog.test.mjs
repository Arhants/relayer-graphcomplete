import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadExternalEvalCatalog } from './external-catalog.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

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
  it('loads only an exact clean pinned checkout and rechecks it on demand', async () => {
    const repo = await fixture();
    const catalog = await loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) });
    expect(catalog.identity).toMatchObject({ repositoryUrl: 'https://example.invalid/catalog.git', commit: repo.commit, entrypoint: 'index.mjs' });
    expect(catalog.cases).toEqual([]);
    await catalog.assertUnchanged();
    await writeFile(path.join(repo.root, 'catalog-data.mjs'), 'export const valid=false\n');
    await expect(catalog.assertUnchanged()).rejects.toThrow('not clean');
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
    await expect(loadExternalEvalCatalog({ repositoryDirectory: repo.root, lock: lockFor(repo) })).rejects.toThrow('not clean');
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
});
