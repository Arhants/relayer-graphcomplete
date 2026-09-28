import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The command's normal output and exit status stay authoritative. Profiling is
// enabled only in CI lanes with Python; a missing interpreter executes directly.
export function runCommand(label, command, args, environment = process.env) {
  const options = { stdio: "inherit", env: environment };
  if (!environment.RELAYER_CI_PROFILE_DIR) return spawnSync(command, args, options);
  const result = spawnSync("python3", [fileURLToPath(new URL("./profile-command.py", import.meta.url)), label, command, ...args], options);
  if (result.error && !result.pid) {
    console.warn("CI resource profiling unavailable; executing command directly");
    return spawnSync(command, args, options);
  }
  return result;
}
