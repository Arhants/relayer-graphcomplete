// Shape check for a design config (design-config-plan.md §1). Returns named
// errors; integrity and colour checks live in validate.mjs.
const HEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/;
const ALIAS = /^var\(--([a-z0-9-]+)\)$/;
const CONFIG_KEYS = new Set(["format", "name", "structure", "palette", "overrides"]);
const FAMILY_KEYS = ["name", "light", "lightIcon", "dark", "darkIcon"];

export const aliasTarget = (value) => ALIAS.exec(value)?.[1] ?? null;
export const isHex = (value) => HEX.test(value);
export const isRgba = (value) => RGBA.test(value);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validRgba = (value) => RGBA.exec(value)?.slice(1, 4).every((channel) => Number(channel) <= 255) ?? false;
const isColour = (value) => typeof value === "string" && (HEX.test(value) || validRgba(value) || ALIAS.test(value));

export function checkConfigShape(config) {
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  if (!isObject(config)) return [{ code: "schema.config", message: "A design config must be a JSON object." }];
  for (const key of Object.keys(config)) if (!CONFIG_KEYS.has(key)) fail("schema.unknown-field", `Unknown field "${key}".`);
  if (config.format !== 1) fail("schema.format", `Unsupported format ${JSON.stringify(config.format)}; expected 1.`);
  if (typeof config.name !== "string" || !config.name.trim()) fail("schema.name", "\"name\" must be a non-empty string.");
  if (typeof config.structure !== "string" || !/^[a-z][a-z0-9-]*$/.test(config.structure)) {
    fail("schema.structure", "\"structure\" must be a lower-case structure name.");
  }
  if (config.overrides !== undefined && !isObject(config.overrides)) fail("schema.overrides", "\"overrides\" must be an object.");
  const palette = config.palette;
  if (!isObject(palette) || !isObject(palette.roles) || !isObject(palette.families)) {
    fail("schema.palette", "\"palette\" must hold \"roles\" and \"families\" objects.");
    return errors;
  }
  for (const key of Object.keys(palette)) {
    if (key !== "roles" && key !== "families") fail("schema.unknown-field", `Unknown palette field "${key}".`);
  }
  for (const [role, value] of Object.entries(palette.roles)) {
    if (!isObject(value) || Object.keys(value).sort().join() !== "dark,light") {
      fail("schema.role", `Role "${role}" must have exactly "light" and "dark".`);
    } else {
      for (const mode of ["light", "dark"]) {
        if (!isColour(value[mode])) fail("schema.colour", `Role "${role}" ${mode} ${JSON.stringify(value[mode])} is not #RRGGBB, rgba() or var(--role).`);
      }
    }
  }
  for (const [id, family] of Object.entries(palette.families)) {
    if (!isObject(family) || Object.keys(family).sort().join() !== [...FAMILY_KEYS].sort().join()) {
      fail("schema.family", `Family "${id}" must have exactly ${FAMILY_KEYS.join(", ")}.`);
      continue;
    }
    if (typeof family.name !== "string" || !family.name.trim()) fail("schema.family", `Family "${id}" needs a name.`);
    for (const key of FAMILY_KEYS.slice(1)) {
      if (!HEX.test(family[key])) fail("schema.colour", `Family "${id}" ${key} ${JSON.stringify(family[key])} is not #RRGGBB.`);
    }
  }
  return errors;
}
