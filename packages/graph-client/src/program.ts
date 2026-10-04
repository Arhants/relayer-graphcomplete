import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** One exact-match edit to the last graph program. `find` must match exactly one place. */
export interface GraphProgramEdit {
  readonly find: string;
  readonly replace: string;
}

export class GraphProgramEditError extends Error {
  override readonly name = "GraphProgramEditError";
}

const PROGRAM_FILE = "program.mjs";
const RERUN_HELPER = "rerunGraphProgram(";

/** Set while a patched program runs, so its own fromEnv() does not replace the saved copy. */
let rerunning = false;

/** The program Node is running from standard input, when there is one. */
function stdinProgramSource(): string | undefined {
  const source = (process as { _eval?: unknown })._eval;
  return typeof source === "string" && source.length > 0 ? source : undefined;
}

/**
 * Keeps the running stdin program in the host's per-turn program folder, so a
 * retry can send edits instead of the whole program. Without a folder nothing
 * is kept; a failed write only leaves this turn on full reruns. A program that
 * is itself a patch is never saved as the base.
 */
export function rememberGraphProgram(directory: string | undefined): void {
  if (directory === undefined || rerunning) return;
  const source = stdinProgramSource();
  if (source === undefined || source.includes(RERUN_HELPER)) return;
  try {
    writeFileSync(join(directory, PROGRAM_FILE), source, { mode: 0o600 });
  } catch {
    // Patching is unavailable for this turn; the full program still runs.
  }
}

/** Applies edits in order. Each `find` must match exactly once in the program as edited so far. */
export function applyGraphProgramEdits(program: string, edits: readonly GraphProgramEdit[]): string {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new GraphProgramEditError("rerunGraphProgram needs a non-empty array of { find, replace } edits.");
  }
  let patched = program;
  edits.forEach((edit, index) => {
    const label = `Edit ${index + 1}`;
    if (typeof edit?.find !== "string" || edit.find === "" || typeof edit.replace !== "string") {
      throw new GraphProgramEditError(`${label} needs a non-empty find string and a replace string.`);
    }
    const first = patched.indexOf(edit.find);
    if (first === -1) {
      throw new GraphProgramEditError(`${label}: find text was not found in the last program. Copy it exactly from that program, or rerun the full program.`);
    }
    if (patched.indexOf(edit.find, first + edit.find.length) !== -1) {
      throw new GraphProgramEditError(`${label}: find text appears more than once in the last program. Include more surrounding lines so it matches one place.`);
    }
    patched = patched.slice(0, first) + edit.replace + patched.slice(first + edit.find.length);
  });
  return patched;
}

/**
 * Edits the last program this interaction ran and runs the result. The edited
 * program becomes the base for the next retry. A missing base or a missing or
 * ambiguous match throws before anything runs, so the graph is untouched.
 */
export async function rerunGraphProgram(
  edits: readonly GraphProgramEdit[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const directory = environment.RELAYER_GRAPH_PROGRAM_DIR;
  if (!directory) throw new GraphProgramEditError("Program edits are not available in this run. Rerun the full program.");
  const path = join(directory, PROGRAM_FILE);
  let previous: string;
  try {
    previous = readFileSync(path, "utf8");
  } catch {
    throw new GraphProgramEditError("There is no earlier program for this interaction to edit. Run the full program.");
  }
  const patched = applyGraphProgramEdits(previous, edits);
  writeFileSync(path, patched, { mode: 0o600 });
  rerunning = true;
  try {
    await import(pathToFileURL(path).href);
  } finally {
    rerunning = false;
  }
}
