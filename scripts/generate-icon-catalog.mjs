import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const catalog = JSON.parse(read('docs/icon-catalog.json'));
const names = catalog.icons.map(({ name }) => name);
if (new Set(names).size !== names.length || catalog.upstream.version !== '0.562.0') throw new Error('Invalid pinned symbol catalog');
for (const name of catalog.legacyNames) if (!names.includes(name)) throw new Error(`Lost legacy symbol ${name}`);
for (const icon of catalog.icons) for (const field of ['description', 'useCases']) if (!icon[field]) throw new Error(`Missing ${field}: ${icon.name}`);
const aliases = JSON.stringify(catalog.aliases, null, 2);
const pythonAliases = Object.entries(catalog.aliases).map(([alias, name]) => `    ${JSON.stringify(alias)}: ${JSON.stringify(name)},`).join('\n');
const rustAliases = Object.entries(catalog.aliases).map(([alias, name]) => `    (${JSON.stringify(alias)}, ${JSON.stringify(name)}),`).join('\n');
const list = names.map((name) => `  ${JSON.stringify(name)},`).join('\n');
const paths = ['packages/graph-client/src/icons.ts', 'desktop/renderer/src/product-workspace/icons.js', 'python/relayer-graph/src/relayer_graph/icons.py', 'crates/relayer-graph-core/src/graph/model/icon.rs'];
const outputs = new Map();
for (const path of paths) {
 let source = read(path);
 if (path.endsWith('.ts')) {
  source = source.replace(/\/\*\*[\s\S]*?\*\//, '/** Generated vocabulary from docs/icon-catalog.json; run node scripts/generate-icon-catalog.mjs. */');
  source = source.replace(/export const RELAYER_ICON_NAMES = \[[\s\S]*?\] as const;/, `export const RELAYER_ICON_NAMES = [\n${list}\n] as const;`);
 } else if (path.endsWith('.js')) {
  source = source.replace(/\/\*\*[\s\S]*?\*\//, '/** Generated vocabulary from docs/icon-catalog.json; run node scripts/generate-icon-catalog.mjs. */');
  source = source.replace(/export const RELAYER_ICON_NAMES = Object.freeze\(\[[\s\S]*?\]\);/, `export const RELAYER_ICON_NAMES = Object.freeze([\n${list}\n]);`);
  source = source.replace('lucideExportName: toPascalCase(renderedName),', 'lucideExportName: RELAYER_ICON_EXPORTS[renderedName] ?? "Circle",');
 } else if (path.endsWith('.py')) {
  source = source.replace(/RELAYER_ICON_ALIASES = MappingProxyType\(\{[\s\S]*?\}\)/, `RELAYER_ICON_ALIASES = MappingProxyType({\n${pythonAliases}\n})`);
  source = source.replace(/^""".*?"""/, '"""Generated vocabulary from docs/icon-catalog.json."""');
  source = source.replace(/# Keep this list[\s\S]*?RELAYER_ICON_NAMES = \([\s\S]*?\n\)/, `RELAYER_ICON_NAMES = (\n${list}\n)`);
 } else {
  source = source.replace(/pub const RELAYER_ICON_ALIASES: &\[\(&str, &str\)\] = &\[[\s\S]*?\n\];/, `pub const RELAYER_ICON_ALIASES: &[(&str, &str)] = &[\n${rustAliases}\n];`);
  source = source.replace(/\/\/\/ Icon names[\s\S]*?pub const RELAYER_ICON_NAMES: &\[&str\] = &\[[\s\S]*?\n\];/, `/// Generated vocabulary from docs/icon-catalog.json.\npub const RELAYER_ICON_NAMES: &[&str] = &[\n${list.replace(/^  /gm, "    ")}\n];`);
 }
 if (path.endsWith('.ts') || path.endsWith('.js')) {
  const ts = path.endsWith('.ts');
  source=source.replace(/export const RELAYER_ICON_ALIASES = Object.freeze\(\{[\s\S]*?\}([\s\S]*?)\);/, `export const RELAYER_ICON_ALIASES = Object.freeze(${aliases}$1);`);
  const prefix = `\n// Generated catalog metadata: discovery reads these fields, never a prompt enum.\nexport const RELAYER_ICON_CATALOG${ts ? ': ReadonlyArray<{name: string; exportName: string; description: string; aliases: string[]; categories: string[]; tags: string[]; useCases: string[]}>' : ''} = Object.freeze(${JSON.stringify(catalog.icons.map(({ svg, ...metadata }) => metadata), null, 2)});\nexport const RELAYER_ICON_EXPORTS${ts ? ': Readonly<Record<string, string>>' : ''} = Object.freeze(${JSON.stringify(Object.fromEntries(catalog.icons.map(i => [i.name, i.exportName])), null, 2)});\n`;
  source=source.replace(/\n\/\/ Generated catalog metadata:[\s\S]*$/, '');
  source+=prefix;
 } else if(path.endsWith('.rs')) {
  source=source.replace(/\npub const RELAYER_ICON_CATALOG_JSON:[^\n]*\n*/, '\n');
  source=source.trimEnd();
  source=source.replace(/\n*#\[cfg\(test\)\]/, '\n\n#[cfg(test)]');
  source=source.replace('#[cfg(test)]', 'pub const RELAYER_ICON_CATALOG_JSON: &str = include_str!("../../../../../docs/icon-catalog.json");\n\n#[cfg(test)]')+'\n';
 }
 outputs.set(path,source);
}
for (const [path, source] of outputs) {
 if (process.argv.includes('--check')) { if(read(path)!==source) throw new Error(`Stale generated vocabulary: ${path}`); }
 else writeFileSync(new URL(path,root),source);
}
