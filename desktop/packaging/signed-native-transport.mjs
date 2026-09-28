import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { signedArtifactName, signedRepository, signedWorkflow, verifySignedNative } from "./signed-native-cache.mjs";

export function validateSignedProducer({ artifact, run, jobs, identity }) {
  const producer = { repository: signedRepository, workflow: signedWorkflow, sourceCommit: run?.head_sha,
    runId: String(run?.id), runAttempt: String(run?.run_attempt) };
  if (!/^[a-f0-9]{40}$/.test(producer.sourceCommit ?? "") || !/^[1-9]\d*$/.test(producer.runId)
    || !/^[1-9]\d*$/.test(producer.runAttempt)
    || run?.repository?.full_name !== signedRepository || run?.head_repository?.full_name !== signedRepository
    || run?.path !== signedWorkflow || run?.event !== "workflow_dispatch" || run?.head_branch !== "main"
    || run?.status !== "completed" || run?.conclusion !== "success"
    || artifact?.name !== signedArtifactName(identity, producer) || artifact?.expired !== false
    || !Number.isSafeInteger(artifact?.id) || artifact.id <= 0
    || !/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? "")
    || artifact?.workflow_run?.id !== run.id || artifact?.workflow_run?.head_sha !== run.head_sha
    || artifact?.workflow_run?.head_branch !== "main") throw Error("untrusted signed native producer/artifact");
  const matches = (jobs?.jobs ?? []).filter((job) => job.name === "Sign and notarize macos-arm64 Preview"
    && job.status === "completed" && job.conclusion === "success" && String(job.run_attempt) === producer.runAttempt);
  if (matches.length !== 1) throw Error("signed native producer package job not successful");
  return producer;
}

// GitHub artifact ZIPs normalize file modes. Extract only the fixed contract;
// never follow archive paths or restore archive-supplied permissions/symlinks.
export function extractSignedArchive(archive, directory) {
  execFileSync("python3", ["-c", `
import pathlib, stat, sys, zipfile
root = pathlib.Path(sys.argv[2])
names = ['relayer-app-server', 'relayer-graph-server']
expected = {'manifest.json'}
for name in names:
    expected.update(['payload/' + name, 'payload/' + name + '.dSYM/Contents/Info.plist', 'payload/' + name + '.dSYM/Contents/Resources/DWARF/' + name])
allowed = expected | {'payload/' + n + '.dSYM/Contents/Resources/Relocations/aarch64/' + n + '.yml' for n in names}
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    actual = {e.filename for e in entries}
    if len(entries) != len(actual) or not expected <= actual <= allowed:
        raise ValueError('unexpected signed artifact archive inventory')
    if sum(e.file_size for e in entries) > 2 * 1024**3:
        raise ValueError('signed artifact expanded size limit')
    for entry in entries:
        mode = entry.external_attr >> 16
        if stat.S_IFMT(mode) not in (0, stat.S_IFREG) or entry.flag_bits & 1:
            raise ValueError('nonregular/encrypted signed artifact entry')
        path = root / entry.filename
        path.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as source, path.open('xb') as output:
            while chunk := source.read(1024 * 1024): output.write(chunk)
        path.chmod(0o755 if entry.filename in ['payload/' + n for n in names] else 0o644)
`, archive, directory], { stdio: "pipe", timeout: 120_000 });
}

async function downloadVerified({ fetchImpl, url, headers, destination, digest }) {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw Error(`artifact download HTTP ${response.status}`);
  const hash = createHash("sha256");
  const file = await open(destination, "wx");
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 ** 3) throw Error("signed artifact download size limit");
      hash.update(chunk);
      await file.writeFile(chunk);
    }
  } finally { await file.close(); }
  if (`sha256:${hash.digest("hex")}` !== digest) throw Error("signed artifact archive digest mismatch");
}

export async function restoreSignedNative({ identity, directory, environment, capture, fetchImpl = fetch, extract = extractSignedArchive, report = console.log }) {
  try {
    if (!environment.GITHUB_TOKEN) throw Error("artifact lookup token unavailable");
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${environment.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28" };
    const base = `https://api.github.com/repos/${signedRepository}/actions`;
    const json = async (url) => {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw Error(`artifact metadata HTTP ${response.status}`);
      return response.json();
    };
    // Bounded search; an old/evicted entry is an ordinary fresh-build miss.
    const candidates = [];
    for (let page = 1; page <= 5 && candidates.length < 5; page += 1) {
      const listed = await json(`${base}/artifacts?per_page=100&page=${page}`);
      const artifacts = listed.artifacts ?? [];
      candidates.push(...artifacts.filter((item) => item.name?.startsWith(`relayer-signed-native-v1-${identity}-`) && !item.expired).slice(0, 5 - candidates.length));
      if (artifacts.length < 100 || page * 100 >= listed.total_count) break;
    }
    for (const listedArtifact of candidates) {
      try {
        if (!Number.isSafeInteger(listedArtifact.id) || listedArtifact.id <= 0) throw Error("invalid artifact ID");
        const artifact = await json(`${base}/artifacts/${listedArtifact.id}`);
        const runId = artifact.workflow_run?.id;
        if (!Number.isSafeInteger(runId) || runId <= 0) throw Error("invalid producer run ID");
        const run = await json(`${base}/runs/${runId}`);
        if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) throw Error("invalid producer attempt");
        const jobs = await json(`${base}/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
        const producer = validateSignedProducer({ artifact, run, jobs, identity });
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
        const archive = `${directory}.zip`;
        await rm(archive, { force: true });
        try {
          await downloadVerified({ fetchImpl, url: `${base}/artifacts/${artifact.id}/zip`, headers, destination: archive, digest: artifact.digest });
          await extract(archive, directory);
        } finally { await rm(archive, { force: true }); }
        const payload = await verifySignedNative({ directory, identity, producer, capture });
        // A rerun started during download must not reinterpret attempt provenance.
        validateSignedProducer({ artifact: await json(`${base}/artifacts/${artifact.id}`), run: await json(`${base}/runs/${runId}`), jobs, identity });
        report(`Signed native cache: verified artifact ${artifact.id} from ${producer.runId}/${producer.runAttempt} (${producer.sourceCommit})`);
        return payload;
      } catch (error) { report(`Signed native cache: rejected entry (${error.message})`); }
    }
    report("Signed native cache: no compatible trusted artifact; compiling fresh");
  } catch (error) { report(`Signed native cache: restore unavailable (${error.message}); compiling fresh`); }
  return null;
}
