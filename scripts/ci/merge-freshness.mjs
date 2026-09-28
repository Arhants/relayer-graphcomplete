import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const WINDOW_MS = 12 * 60 * 60 * 1000;
export const CHECK_NAME = "merge-freshness";
const artifactName = (attempt) => `merge-freshness-v1-${attempt}`;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);

// This runs in ordinary read-only PR CI, never in the privileged sweep.
export function recordEvidence(event, env, git) {
  const pr = event.pull_request;
  const mergeSha = git(["rev-parse", "HEAD"]);
  const parents = git(["show", "-s", "--format=%P", "HEAD"]).split(" ");
  if (!pr || pr.base.ref !== "main" || parents.length !== 2 ||
      mergeSha !== env.GITHUB_SHA || parents[1] !== pr.head.sha) {
    throw new Error("CI checkout is not the event's exact main + PR merge");
  }
  // PR base metadata can predate the event's generated merge. The actual first
  // parent is the tested base; the guard compares it to this main observation.
  const observedMain = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0];
  if (![mergeSha, ...parents, observedMain].every(sha)) throw new Error("Invalid Git identity");
  return {
    version: 1, repository: env.GITHUB_REPOSITORY, pr: pr.number,
    runId: Number(env.GITHUB_RUN_ID), attempt: Number(env.GITHUB_RUN_ATTEMPT),
    headSha: parents[1], baseSha: parents[0], mergeSha, observedMain,
  };
}

export function evaluateEvidence({ pr, run, jobs, receipt, merge, repository, now }) {
  const fail = (description) => ({ conclusion: "failure", description });
  if (pr.state !== "open" || pr.base.ref !== "main" || pr.base.repo.full_name !== repository)
    return fail("Not an open pull request targeting this repository's main");
  if (pr.mergeable !== true) return fail("Merge conflicts or mergeability not yet known");
  if (!run || run.event !== "pull_request" || run.path !== ".github/workflows/ci.yml" ||
      run.repository?.full_name !== repository || run.head_sha !== pr.head.sha ||
      run.status !== "completed" || run.conclusion !== "success")
    return fail("Current PR head needs a successful CI run");
  // Re-running old CI does not refresh its original main observation window.
  const created = Date.parse(run.created_at);
  if (!Number.isFinite(created) || created > now || now - created >= WINDOW_MS)
    return fail("CI evidence expired (12h); update branch and run fresh PR CI");
  if (!jobs.some((job) => job.name === "check" && job.head_sha === pr.head.sha &&
      job.status === "completed" && job.conclusion === "success"))
    return fail("Required check did not succeed for this run attempt");
  if (!receipt || receipt.version !== 1 || receipt.repository !== repository ||
      receipt.pr !== pr.number || receipt.runId !== run.id ||
      !Number.isSafeInteger(receipt.attempt) || receipt.attempt < 1 || receipt.attempt > run.run_attempt ||
      receipt.headSha !== pr.head.sha || ![receipt.headSha, receipt.baseSha, receipt.mergeSha].every(sha) ||
      receipt.observedMain !== receipt.baseSha || merge?.sha !== receipt.mergeSha ||
      merge.parents?.length !== 2 || merge.parents[0].sha !== receipt.baseSha ||
      merge.parents[1].sha !== receipt.headSha)
    return fail("Missing or mismatched evidence of CI against then-current main");
  return { conclusion: "success", description: `CI evidence valid until ${new Date(created + WINDOW_MS).toISOString()}` };
}

// Do not extract files or execute anything from PR artifacts. Bound both archive
// size and decompressed stdout, and accept only the one literal JSON member.
export async function decodeReceipt(bytes) {
  if (bytes.byteLength > 64 * 1024) throw new Error("Evidence archive too large");
  const directory = await mkdtemp(join(tmpdir(), "merge-freshness-"));
  try {
    const archive = join(directory, "receipt.zip");
    await writeFile(archive, Buffer.from(bytes));
    const raw = execFileSync("unzip", ["-p", archive, "freshness.json"], {
      encoding: "utf8", maxBuffer: 8192, timeout: 5000, stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function sweep({ github, owner, repo, clock = Date.now, decode = decodeReceipt }) {
  const repository = `${owner}/${repo}`;
  const prs = await github.paginate(github.rest.pulls.list, { owner, repo, state: "open", base: "main", per_page: 100 });
  const results = [];
  for (const listed of prs) {
    try {
      const result = await refreshPullRequest({ github, owner, repo, repository, listed, clock, decode });
      if (result) results.push(result);
    } catch {
      // A PR-specific read/write failure must not prevent expiration of other PRs.
      results.push({ pr: listed.number, conclusion: "failure", published: false,
        description: "Freshness check could not be refreshed; retry the guard" });
    }
  }
  return results;
}

async function refreshPullRequest({ github, owner, repo, repository, listed, clock, decode }) {
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: listed.number });
  if (pr.state !== "open" || pr.base.ref !== "main") return null;
  // Revoke the previous success before doing fallible evidence IO. Global
  // workflow concurrency serializes writers; recheck head before completion.
  const { data: check } = await github.rest.checks.create({
    owner, repo, name: CHECK_NAME, head_sha: pr.head.sha, status: "in_progress",
    output: { title: "Checking 12-hour CI freshness", summary: "Scheduled refresh; no code is executed from this PR." },
  });
  let verdict;
  try {
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      owner, repo, workflow_id: "ci.yml", event: "pull_request", head_sha: pr.head.sha, per_page: 100,
    });
    // Different branch refs can share a SHA. Never borrow another PR's run.
    // Preserve newest-first API order, including pending or failed runs.
    const run = runs.find((candidate) => candidate.pull_requests?.some((associated) =>
      associated.number === pr.number && associated.head?.sha === pr.head.sha));
    let jobs = [], receipt, merge;
    if (run?.status === "completed" && run.conclusion === "success" &&
        clock() - Date.parse(run.created_at) < WINDOW_MS) {
      jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        owner, repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100,
      });
      const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
        owner, repo, run_id: run.id, per_page: 100,
      });
      // "Re-run failed jobs" does not repeat a successful plan job. Its
      // receipt remains valid for this immutable run/merge, but can never
      // renew the original created_at window. Prefer the newest plan receipt.
      const matches = artifacts.filter((item) => {
        const attempt = /^merge-freshness-v1-([1-9][0-9]*)$/.exec(item.name)?.[1];
        return attempt && Number(attempt) <= run.run_attempt && !item.expired;
      }).sort((a, b) => Number(b.name.split("-").at(-1)) - Number(a.name.split("-").at(-1)));
      if (matches.length && matches[0].size_in_bytes <= 64 * 1024) {
        if (matches[1]?.name === matches[0].name) throw new Error("Duplicate evidence");
        const archive = await github.rest.actions.downloadArtifact({
          owner, repo, artifact_id: matches[0].id, archive_format: "zip",
        });
        receipt = await decode(archive.data);
        if (matches[0].name !== artifactName(receipt?.attempt)) throw new Error("Evidence attempt mismatch");
        if (sha(receipt?.mergeSha)) {
          ({ data: merge } = await github.rest.git.getCommit({ owner, repo, commit_sha: receipt.mergeSha }));
        }
      }
    }
    const { data: current } = await github.rest.pulls.get({ owner, repo, pull_number: pr.number });
    verdict = current.head.sha === pr.head.sha
      ? evaluateEvidence({ pr: current, run, jobs, receipt, merge, repository, now: clock() })
      : { conclusion: "failure", description: "PR head changed during evaluation" };
  } catch {
    verdict = { conclusion: "failure", description: "Freshness evidence unavailable; retry the guard" };
  }
  await github.rest.checks.update({
    owner, repo, check_run_id: check.id, status: "completed", conclusion: verdict.conclusion,
    output: { title: verdict.description, summary: `${verdict.description}\n\n12-hour window; scheduled expiration can lag. Required check CI is separate.` },
  });
  return { pr: pr.number, ...verdict, published: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "record") throw new Error("Expected record command");
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const receipt = recordEvidence(event, process.env, (args) => execFileSync("git", args, { encoding: "utf8" }).trim());
  await writeFile(join(process.env.RUNNER_TEMP, "freshness.json"), `${JSON.stringify(receipt)}\n`);
}
