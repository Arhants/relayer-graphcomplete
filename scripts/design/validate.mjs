#!/usr/bin/env node
// Validates a design config against its structure file (design-config-plan.md §1.7).
// Schema and integrity problems are errors. Contrast floors and state pairs are
// warnings until the PRD adopts the floors (PD-5).
// Usage: node scripts/design/validate.mjs <config.json>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { contrast, dE } from "./color.mjs";
import { aliasTarget, checkConfigShape, isHex } from "./schema.mjs";

const structuresDirectory = fileURLToPath(new URL("../../designs/structures/", import.meta.url));
const MODES = ["light", "dark"];

export async function loadStructure(name) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) return null;
  try {
    return JSON.parse(await readFile(resolve(structuresDirectory, `${name}.json`), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function validate(config) {
  return validateDesign(config, await loadStructure(config?.structure));
}

// A structure file is checked too, so a typo there cannot silently drop a check.
export function checkStructure(structure) {
  const errors = [];
  const roles = new Set(structure.roles);
  const colour = (name) => roles.has(name) || name === "family:fill" || name === "family:icon";
  const fail = (message) => errors.push({ code: "structure.contract", message: `${structure.name}: ${message}` });
  for (const role of structure.translucent) if (!roles.has(role)) fail(`translucent role "${role}" is not a role.`);
  for (const [group, members] of Object.entries(structure.groups)) {
    for (const role of members) if (!roles.has(role)) fail(`group "${group}" names unknown role "${role}".`);
  }
  for (const [from, to] of structure.allowedAliases) {
    if (!structure.groups[from] || !structure.groups[to]) fail(`allowed alias ${from} -> ${to} names an unknown group.`);
  }
  for (const pair of [...structure.pairs.map(({ fg, bg }) => [fg, bg]), ...structure.distinct.map(({ a, b }) => [a, b])]) {
    for (const name of pair) {
      if (!colour(name)) fail(`pair names unknown role "${name}".`);
      else if (structure.translucent.includes(name)) fail(`pair names translucent role "${name}", which has no single contrast.`);
    }
  }
  for (const pair of structure.pairs) if (!(pair.kind in structure.floors)) fail(`pair "${pair.what}" has unknown kind "${pair.kind}".`);
  const validFloor = (floor) => typeof floor === "number" && Number.isFinite(floor) && floor >= 0;
  for (const [kind, floor] of Object.entries(structure.floors)) if (!validFloor(floor)) fail(`floor "${kind}" must be a finite number of at least 0.`);
  for (const pair of structure.distinct) if (!validFloor(pair.floor)) fail(`distinct pair "${pair.what}" needs a finite floor of at least 0.`);
  return errors;
}

export function validateDesign(config, structure) {
  const errors = checkConfigShape(config);
  const fail = (code, message) => errors.push({ code, message });
  if (!errors.length && !structure) fail("integrity.structure", `No structure file for "${config.structure}".`);
  if (!errors.length) errors.push(...checkStructure(structure));
  if (errors.length) return { errors, warnings: [], checks: [] };

  const { roles, families } = config.palette;
  const known = new Set(structure.roles);
  for (const role of structure.roles) if (!Object.hasOwn(roles, role)) fail("integrity.missing-role", `Missing role "${role}".`);
  for (const role of Object.keys(roles)) if (!known.has(role)) fail("integrity.unknown-role", `The ${structure.name} structure has no role "${role}".`);
  if (Object.keys(families).sort().join() !== [...structure.families].sort().join()) {
    fail("integrity.families", `Families must be exactly ${structure.families.join(", ")}.`);
  }
  for (const token of Object.keys(config.overrides ?? {})) {
    if (!structure.tokens.includes(token)) fail("integrity.override", `The ${structure.name} structure does not read "${token}".`);
  }

  // A palette may alias running to interaction; it never merges two other meanings.
  const groupOf = new Map(Object.entries(structure.groups).flatMap(([group, members]) => members.map((role) => [role, group])));
  const aliasAllowed = (from, to) => {
    const a = groupOf.get(from), b = groupOf.get(to);
    return a === b || structure.allowedAliases.some(([x, y]) => x === a && y === b);
  };
  for (const [role, value] of Object.entries(roles)) {
    for (const mode of MODES) {
      const target = aliasTarget(value[mode]);
      if (!target) continue;
      if (!Object.hasOwn(roles, target)) fail("integrity.alias-target", `Role "${role}" ${mode} aliases unknown role "${target}".`);
      else if (!aliasAllowed(role, target)) fail("integrity.alias-state", `Role "${role}" may not alias "${target}": it would merge two meanings.`);
    }
  }
  const resolved = (role, mode, seen = new Set()) => {
    if (seen.has(role)) return null;
    seen.add(role);
    const value = roles[role]?.[mode];
    const target = aliasTarget(value ?? "");
    return target ? resolved(target, mode, seen) : value;
  };
  for (const role of Object.keys(roles)) {
    for (const mode of MODES) {
      const value = resolved(role, mode);
      if (value === null) fail("integrity.alias-cycle", `Role "${role}" ${mode} aliases itself.`);
      else if (value && !isHex(value) && !structure.translucent.includes(role)) {
        fail("integrity.translucent", `Role "${role}" ${mode} must be an opaque #RRGGBB colour.`);
      }
    }
  }
  if (errors.length) return { errors, warnings: [], checks: [] };

  const colour = (name, mode) => {
    const [family, part] = name.split(":");
    if (part) return families[family][mode + (part === "icon" ? "Icon" : "")];
    return resolved(name, mode);
  };
  const pairs = structure.pairs.flatMap((pair) => (pair.fg.startsWith("family:") || pair.bg.startsWith("family:")
    ? structure.families.map((id) => ({
      ...pair,
      fg: pair.fg.replace("family", id),
      bg: pair.bg.replace("family", id),
      what: pair.what.replace("{family}", families[id].name),
    }))
    : [pair]));
  const checks = [];
  for (const pair of pairs) {
    for (const mode of MODES) {
      const fg = colour(pair.fg, mode), bg = colour(pair.bg, mode);
      const floor = structure.floors[pair.kind];
      const value = contrast(fg, bg);
      checks.push({ type: "contrast", mode, what: pair.what, a: `${pair.fg} ${fg}`, b: `${pair.bg} ${bg}`, value, floor, ok: value >= floor });
    }
  }
  for (const pair of structure.distinct) {
    for (const mode of MODES) {
      const a = colour(pair.a, mode), b = colour(pair.b, mode);
      const value = dE(a, b);
      const cvd = Math.min(dE(a, b, "protan"), dE(a, b, "deutan"));
      checks.push({ type: "distinct", mode, what: pair.what, a: `${pair.a} ${a}`, b: `${pair.b} ${b}`, value, cvd, floor: pair.floor, ok: value >= pair.floor });
    }
  }
  const warnings = checks.filter((check) => !check.ok).map((check) => ({
    code: `floor.${check.type}`,
    message: `${check.mode} ${check.what}: ${check.a} vs ${check.b} is ${check.value.toFixed(2)}, below ${check.floor}.`,
  }));
  return { errors, warnings, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/design/validate.mjs <config.json>");
    process.exit(2);
  }
  const config = JSON.parse(await readFile(resolve(path), "utf8"));
  const { errors, warnings, checks } = await validate(config);
  for (const error of errors) console.log(`error   ${error.code}: ${error.message}`);
  for (const warning of warnings) console.log(`warning ${warning.code}: ${warning.message}`);
  console.log(`${checks.length} checks, ${warnings.length} below floor (warnings until PD-5), ${errors.length} errors.`);
  process.exitCode = errors.length ? 1 : 0;
}
