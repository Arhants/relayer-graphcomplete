import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = 1;
const MAX_ATTEMPTS_PER_OWNER = 32;
const MAX_ATTEMPTS_GLOBAL = 64;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_BYTES = 24 * 1024 * 1024;
const RECORD_NAME = /^[a-f0-9]{64}\.json$/u;
const FAILURE_CODES = new Set([
  "share_cancelled",
  "share_sign_in_required",
  "share_imported_conversation",
  "share_no_accepted_completion",
  "share_title_required",
  "share_title_too_long",
  "share_snapshot_too_large",
  "share_export_failed",
  "share_upload_failed",
  "share_service_failed",
  "daily_quota_exhausted",
  "reservation_limit_exhausted",
  "share_attempt_unavailable",
]);

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function validFailure(value, reference) {
  return value === null || (
    exactKeys(value, ["status", "attemptReferenceId", "code", "retryable"], ["resetAt"])
    && value.status === "failed"
    && value.attemptReferenceId === reference
    && FAILURE_CODES.has(value.code)
    && typeof value.retryable === "boolean"
    && (!Object.hasOwn(value, "resetAt") || (typeof value.resetAt === "string" && value.resetAt.length <= 64))
  );
}

function validPublishedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.hostname !== "";
  } catch {
    return false;
  }
}

function validateRecord(value) {
  if (!exactKeys(value, [
    "reference", "attemptId", "ownerKey", "threadId", "sourceThreadId", "title",
    "snapshotBytes", "createdAt", "lastFailure", "reportedFailures", "publishedUrl",
  ])
    || typeof value.reference !== "string" || !/^SHR-[A-Z0-9]{8,32}$/u.test(value.reference)
    || typeof value.attemptId !== "string" || !/^[a-f0-9]{32}$/u.test(value.attemptId)
    || typeof value.ownerKey !== "string" || value.ownerKey.length === 0 || value.ownerKey.length > 512
    || !Number.isSafeInteger(value.threadId) || value.threadId <= 0
    || typeof value.sourceThreadId !== "string" || value.sourceThreadId.length === 0 || value.sourceThreadId.length > 1024
    || typeof value.title !== "string" || [...value.title].length > 120
    || (!Array.isArray(value.snapshotBytes) && !(value.snapshotBytes instanceof Uint8Array))
    || value.snapshotBytes.length > MAX_SNAPSHOT_BYTES
    || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0
    || !validFailure(value.lastFailure, value.reference)
    || !Array.isArray(value.reportedFailures) || value.reportedFailures.length > 16
    || value.reportedFailures.some((key) => typeof key !== "string" || key.length === 0 || key.length > 128)) {
    throw new TypeError("Share publish attempt record is invalid.");
  }
  const published = validPublishedUrl(value.publishedUrl);
  const durableExportFailure = !published
    && value.snapshotBytes.length === 0
    && value.lastFailure !== null
    && value.lastFailure.retryable === false
    && ["share_snapshot_too_large", "share_export_failed"].includes(value.lastFailure.code);
  if ((published && (value.snapshotBytes.length !== 0 || value.lastFailure !== null))
    || (!published && (value.publishedUrl !== null
      || (value.snapshotBytes.length === 0 && !durableExportFailure)))) {
    throw new TypeError("Share publish attempt record is invalid.");
  }
  if (Array.isArray(value.snapshotBytes)
    && value.snapshotBytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new TypeError("Share publish attempt record is invalid.");
  }
  return value;
}

function filename(reference) {
  return `${createHash("sha256").update(reference, "utf8").digest("hex")}.json`;
}

function encodeRecord(input) {
  const value = validateRecord(input);
  return {
    version: VERSION,
    reference: value.reference,
    attemptId: value.attemptId,
    ownerKey: value.ownerKey,
    threadId: value.threadId,
    sourceThreadId: value.sourceThreadId,
    title: value.title,
    snapshot: Buffer.from(value.snapshotBytes).toString("base64"),
    createdAt: value.createdAt,
    lastFailure: value.lastFailure,
    reportedFailures: [...new Set(value.reportedFailures)],
    publishedUrl: value.publishedUrl,
  };
}

function decodeRecord(envelope) {
  if (!exactKeys(envelope, [
    "version", "reference", "attemptId", "ownerKey", "threadId", "sourceThreadId",
    "title", "snapshot", "createdAt", "lastFailure", "reportedFailures", "publishedUrl",
  ]) || envelope.version !== VERSION || typeof envelope.snapshot !== "string"
    || envelope.snapshot.length > Math.ceil(MAX_SNAPSHOT_BYTES / 3) * 4
    || envelope.snapshot.length % 4 !== 0) {
    throw new TypeError("Share publish attempt envelope is invalid.");
  }
  const snapshotBytes = new Uint8Array(Buffer.from(envelope.snapshot, "base64"));
  // Canonical round-trip validation also checks alphabet and padding without a
  // grouped-repeat regexp that can exhaust V8's stack on supported snapshots.
  if (Buffer.from(snapshotBytes).toString("base64") !== envelope.snapshot) {
    throw new TypeError("Share publish attempt envelope is invalid.");
  }
  return validateRecord({
    reference: envelope.reference,
    attemptId: envelope.attemptId,
    ownerKey: envelope.ownerKey,
    threadId: envelope.threadId,
    sourceThreadId: envelope.sourceThreadId,
    title: envelope.title,
    snapshotBytes,
    createdAt: envelope.createdAt,
    lastFailure: envelope.lastFailure,
    reportedFailures: envelope.reportedFailures,
    publishedUrl: envelope.publishedUrl,
  });
}

export function createSharePublishAttemptStore({ directory, readFileImpl = readFile, statImpl = stat } = {}) {
  if (typeof directory !== "string" || !directory) {
    throw new TypeError("Share publish attempt directory is invalid.");
  }
  let queue = Promise.resolve();

  function serialize(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function recordNames() {
    try {
      return (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && RECORD_NAME.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async function loadRecord(name) {
    const path = join(directory, name);
    // Filesystem failures are not evidence of corrupt bytes. Keep the durable
    // record intact so the next operation can retry a transient read failure.
    let size;
    let text;
    try {
      size = (await statImpl(path)).size;
      if (size <= MAX_RECORD_BYTES) text = await readFileImpl(path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    try {
      if (size > MAX_RECORD_BYTES) throw new Error("Share publish attempt record is oversized.");
      const record = decodeRecord(JSON.parse(text));
      if (filename(record.reference) !== name) throw new Error("Share publish attempt identity does not match its path.");
      return record;
    } catch {
      await rm(path, { force: true });
      return null;
    }
  }

  return Object.freeze({
    async load({ visit } = {}) {
      await queue;
      const records = [];
      for (const name of await recordNames()) {
        const record = await loadRecord(name);
        if (record) {
          if (visit) await visit(record);
          else records.push(record);
        }
      }
      return records.sort((left, right) => left.createdAt - right.createdAt);
    },

    async read(reference) {
      await queue;
      return loadRecord(filename(reference));
    },

    save(record) {
      return serialize(async () => {
        const envelope = encodeRecord(record);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await chmod(directory, 0o700);
        const name = filename(envelope.reference);
        const names = await recordNames();
        if (!names.includes(name)) {
          // Keep a hard device bound without materializing every possible
          // 16 MiB snapshot at once. Owner counting is sequential for the same
          // reason; loadRecord also repairs malformed entries as it visits.
          if (names.length >= MAX_ATTEMPTS_GLOBAL) {
            throw new Error("Share publish attempt capacity is exhausted.");
          }
          let ownerAttempts = 0;
          for (const candidate of names) {
            const existing = await loadRecord(candidate);
            if (existing?.ownerKey === envelope.ownerKey) ownerAttempts += 1;
            if (ownerAttempts >= MAX_ATTEMPTS_PER_OWNER) {
              throw new Error("Share publish attempt capacity is exhausted.");
            }
          }
        }
        const path = join(directory, name);
        const temporary = join(directory, `${name}.${process.pid}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
          await rename(temporary, path);
        } finally {
          await rm(temporary, { force: true });
        }
      });
    },

    delete(reference) {
      return serialize(async () => {
        if (typeof reference !== "string" || !/^SHR-[A-Z0-9]{8,32}$/u.test(reference)) return false;
        try {
          await rm(join(directory, filename(reference)));
          return true;
        } catch (error) {
          if (error?.code === "ENOENT") return false;
          throw error;
        }
      });
    },
  });
}
