#!/usr/bin/env node
// Turns a prototype token file (TOKENS + FAMILIES, as in docs/design/visual-redesign/sources/gen2/<id>/tokens.mjs)
// into a design config for one structure, taking exactly the roles and families that structure reads.
// Usage: node scripts/design/import-palette.mjs <tokens.mjs> --structure sticker --name "H · Sticker × Cocoa" > config.json
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadStructure } from "./validate.mjs";

export async function importPalette({ tokens, families, structure, name }) {
  const missing = [...structure.roles.filter((role) => !tokens[role]), ...structure.families.filter((id) => !families[id])];
  if (missing.length) throw new Error(`The token file lacks ${missing.join(", ")}.`);
  return {
    format: 1,
    name,
    structure: structure.name,
    palette: {
      roles: Object.fromEntries(structure.roles.map((role) => [role, { light: tokens[role].light, dark: tokens[role].dark }])),
      families: Object.fromEntries(structure.families.map((id) => {
        const { name: familyName, light, lightIcon, dark, darkIcon } = families[id];
        return [id, { name: familyName, light, lightIcon, dark, darkIcon }];
      })),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source] = process.argv.slice(2);
  const option = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  if (!source || !process.argv.includes("--structure") || !process.argv.includes("--name")) {
    console.error("Usage: node scripts/design/import-palette.mjs <tokens.mjs> --structure <name> --name <display name>");
    process.exit(2);
  }
  const structure = await loadStructure(option("--structure"));
  if (!structure) throw new Error(`No structure file for "${option("--structure")}".`);
  const { TOKENS, FAMILIES } = await import(pathToFileURL(resolve(source)).href);
  const config = await importPalette({ tokens: TOKENS, families: FAMILIES, structure, name: option("--name") });
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}
