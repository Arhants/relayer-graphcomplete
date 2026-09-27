import { restoreAttempt } from "./cache-restore-process.mjs";
import * as core from "@actions/core";
import { restoreWithRetry } from "./cache-restore-policy.mjs";

const key = core.getInput("key", { required: true });
const paths = core.getMultilineInput("path", { required: true });
const restoreKeys = core.getMultilineInput("restore-keys");
core.setOutput("cache-primary-key", key);
const matched = await restoreWithRetry({
  attempt: () => restoreAttempt({ request: { paths, key, restoreKeys } }),
  report: (value) => core.info(`Packaging cache restore: ${JSON.stringify(value)}`),
});
core.setOutput("cache-hit", matched === key ? "true" : "false");
core.setOutput("cache-matched-key", matched ?? "");
