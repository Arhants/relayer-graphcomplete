import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, chmod, cp, lstat, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

const digest = (value) => createHash("sha256").update(value).digest("hex");
export async function timedStage(label, operation, environment = process.env) {
  const started = performance.now();
  let outcome = "failed";
  try { const value = await operation(); outcome = "passed"; return value; }
  finally {
    const message = `Packaging ${label}: ${outcome} in ${((performance.now() - started) / 1000).toFixed(2)}s`;
    try {
      console.log(message);
      if (environment.GITHUB_STEP_SUMMARY) await appendFile(environment.GITHUB_STEP_SUMMARY, `- ${message}\n`);
    } catch { /* Evidence transport is not a build gate. */ }
  }
}

// Reject symlinks rather than hashing a link while compiling different target bytes.
export async function inventory(directory) {
  const result = {};
  async function visit(path, relative) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`cache input contains symlink: ${relative}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), relative ? `${relative}/${name}` : name);
    } else if (info.isFile()) result[relative] = { sha256: digest(await readFile(path)), executable: Boolean(info.mode & 0o111) };
    else throw new Error(`unsupported cache input: ${relative}`);
  }
  await visit(directory, "");
  return result;
}

export function packagingBuildEnvironment(environment) {
  const result = { ...environment };
  // npm injects these solely to resolve JS commands. Native compilation uses the
  // same tool search path as the workflow identity step, not package executables.
  if (result.PATH) result.PATH = [...new Set([dirname(process.execPath), ...result.PATH.split(":").filter((path) => !path.endsWith("/node_modules/.bin") && !path.endsWith("/node-gyp-bin"))])].join(":");
  return result;
}

export async function packagingIdentity({ repositoryRoot, cacheRoot, target, environment = process.env, command }) {
  environment = packagingBuildEnvironment(environment);
  command ??= (name, args) => execFileSync(name, args, { encoding: "utf8", env: environment }).trim();
  // This reviewed input contract covers the current Cargo build scripts and includes.
  // Changed build scripts are hashed; adding external inputs requires extending this list.
  const nativePaths = ["vendor/ladybug", "scripts/prepare-ladybug-source.mjs", "scripts/verify-ladybug-native-receipts.mjs", "desktop/packaging", "desktop/shared/target.mjs", "scripts/ci/packaging-input-contract.json"];
  const rustPaths = ["crates", "Cargo.toml", "Cargo.lock", ".cargo", "docs/graph-query-v1.md", "fixtures/graph-query-v1"];
  async function inputs(paths) {
    const values = {};
    for (const path of paths) values[path] = await inventory(join(repositoryRoot, path));
    return values;
  }
  const contract = JSON.parse(await readFile(join(repositoryRoot, "scripts/ci/packaging-input-contract.json"), "utf8"));
  const configuration = contract.reviewedBuildConfiguration;
  if (contract.version !== 1 || !configuration) throw new Error("unreviewed packaging input contract");
  for (const [path, expected] of Object.entries(configuration)) {
    if (digest(await readFile(join(repositoryRoot, path))) !== expected) throw new Error(`unreviewed build configuration: ${path}`);
  }
  for (const crate of await readdir(join(repositoryRoot, "crates"))) {
    try {
      await lstat(join(repositoryRoot, "crates", crate, "build.rs"));
      if (!configuration[`crates/${crate}/build.rs`]) throw new Error("new build script requires input-contract review");
    } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
  }
  for (const filename of ["config", "config.toml"]) {
    const path = `.cargo/${filename}`;
    try { await lstat(join(repositoryRoot, path)); if (!configuration[path]) throw new Error(`unreviewed Cargo configuration: ${path}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  let ancestor = dirname(resolve(repositoryRoot));
  for (;;) {
    for (const filename of ["config", "config.toml"]) {
      try { await lstat(join(ancestor, ".cargo", filename)); throw new Error("ancestor Cargo configuration: using fresh compilation"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const unsupported = Object.keys(environment).filter((name) => /^(RUSTC$|RUSTDOC$|CC$|CC_|CXX|CPP|CFLAGS|CXXFLAGS|AR$|AR_|LD$|LD_|LDFLAGS|CARGO_BUILD_|CARGO_TARGET_|CARGO_PROFILE_|CMAKE_|SDKROOT$|C_INCLUDE_PATH$|CPLUS_INCLUDE_PATH$|OBJC_INCLUDE_PATH$|CPATH$|LIBRARY_PATH$|DYLD|PKG_CONFIG|SOURCE_DATE_EPOCH$)/.test(name) && environment[name]);
  if (unsupported.length) throw new Error(`custom build inputs: ${unsupported.join(", ")}`);
  const overrides = Object.fromEntries(Object.entries(environment).filter(([name]) => /^(CARGO|RUST|CC(?:_|$)|CXX|CPP|CFLAGS|CXXFLAGS|AR(?:_|$)|LD(?:_|$)|LDFLAGS|SDK|MACOSX|CMAKE|LBUG|OPENSSL|PKG_CONFIG|CPATH|LIBRARY_PATH|DYLD|PATH$|DEVELOPER_DIR)/.test(name)).sort(([a], [b]) => a.localeCompare(b)));
  // Ambient custom toolchains, config and target directories are unsupported cache inputs.
  if (environment.RUSTFLAGS || environment.CARGO_ENCODED_RUSTFLAGS || environment.RUSTC_WRAPPER || environment.RUSTC_WORKSPACE_WRAPPER || environment.CARGO_TARGET_DIR || environment.RELAYER_CARGO_TARGET_DIR) throw new Error("custom Rust flags/wrappers/target directory: using fresh compilation");
  const cargoHome = environment.CARGO_HOME || join(environment.HOME || homedir(), ".cargo");
  for (const filename of ["config", "config.toml"]) {
    try { await lstat(join(cargoHome, filename)); throw new Error("user Cargo configuration: using fresh compilation"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const metadata = JSON.parse(command("cargo", ["metadata", "--no-deps", "--locked", "--offline", "--format-version", "1", "--manifest-path", join(repositoryRoot, "Cargo.toml")]));
  const crateRoot = resolve(repositoryRoot, "crates") + sep;
  for (const pkg of metadata.packages) {
    if (!resolve(pkg.manifest_path).startsWith(crateRoot)) throw new Error("external workspace package requires input-contract review");
    for (const target of pkg.targets ?? []) {
      if (target.kind.includes("custom-build") && !configuration[relative(repositoryRoot, target.src_path)]) throw new Error("custom build script requires input-contract review");
    }
    for (const dependency of pkg.dependencies ?? []) {
      if (dependency.path && !resolve(dependency.path).startsWith(crateRoot)) throw new Error("external path dependency requires input-contract review");
    }
  }
  const machine = {
    target: target.rustTarget,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    repositoryRoot: resolve(repositoryRoot),
    cacheRoot: resolve(cacheRoot), // OpenSSL prefixes and Cargo source paths are not relocatable.
    rustc: command("rustc", ["--version", "--verbose"]),
    cargo: command("cargo", ["--version"]),
    clang: command("xcrun", ["clang", "--version"]),
    sdk: command("xcrun", ["--sdk", "macosx", "--show-sdk-path"]),
    sdkVersion: command("xcrun", ["--sdk", "macosx", "--show-sdk-build-version"]),
    cmake: command("cmake", ["--version"]),
    make: command("make", ["--version"]),
    perl: command("perl", ["-V"]),
    overrides,
  };
  const native = digest(JSON.stringify({ version: 1, machine, inputs: await inputs(nativePaths) }));
  const runtime = digest(JSON.stringify({ version: 1, native, profile: "release", features: "default", packages: ["relayer-app-server", "relayer-graph-server"], inputs: await inputs(rustPaths) }));
  return { native, runtime };
}

export async function verifyDirectory(directory, identity) {
  const receipt = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  if (receipt.version !== 1 || receipt.identity !== identity) throw new Error("cache identity mismatch");
  const actual = await inventory(join(directory, "payload"));
  if (JSON.stringify(actual) !== JSON.stringify(receipt.files) || Object.keys(actual).length === 0) throw new Error("cache inventory mismatch");
  return join(directory, "payload");
}

// A receipt is published last. Concurrent consumers fall back rather than observing a partial entry.
export async function cachedBuild({ cacheRoot, kind, identity, build, validate = async () => {}, fallback, report = console.log }) {
  const directory = join(cacheRoot, kind, identity);
  const emit = (text) => { try { report(`Packaging ${kind} cache: ${text}`); } catch { /* non-gating */ } };
  try {
    const payload = await verifyDirectory(directory, identity);
    await validate(payload);
    emit("verified hit");
    return payload;
  } catch (error) { emit(`miss/rejected (${error.code ?? error.message})`); }
  let lock;
  try {
    await mkdir(join(cacheRoot, kind), { recursive: true });
    lock = await open(`${directory}.lock`, "wx", 0o600);
  } catch { emit("unavailable/busy; fresh fallback"); return fallback(); }
  try {
    try {
      await rm(directory, { recursive: true, force: true });
      await mkdir(join(directory, "payload"), { recursive: true });
    } catch { emit("unwritable; fresh fallback"); return await fallback(); }
    const payload = join(directory, "payload");
    // Build/validation failures propagate. Never turn a compiler error into a retry.
    if (await build(payload) === false) return null;
    await validate(payload);
    try {
      await writeFile(join(directory, "manifest.json"), JSON.stringify({ version: 1, identity, files: await inventory(payload) }));
      emit("sealed fresh build");
    } catch { emit("receipt save failed; freshly built output remains usable"); }
    return payload;
  } finally {
    await lock.close().catch(() => {});
    await rm(`${directory}.lock`, { force: true }).catch(() => {});
  }
}

export async function installRuntime(payload, outputDirectory) {
  const expected = ["relayer-app-server", "relayer-graph-server"];
  if (JSON.stringify((await readdir(payload)).sort()) !== JSON.stringify(expected)) throw new Error("runtime binary inventory mismatch");
  // Verify the complete payload before touching either installed binary.
  await inventory(payload);
  await mkdir(outputDirectory, { recursive: true });
  for (const name of expected) {
    await cp(join(payload, name), join(outputDirectory, name));
    await chmod(join(outputDirectory, name), 0o755);
  }
}
