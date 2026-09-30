import { expect, it } from "vitest";
import { evalTurnTimeoutMs } from "../desktop/eval-main/eval-service.mjs";

it("keeps Eval's 10-minute turn bound unless a positive override is set", () => {
  expect(evalTurnTimeoutMs({})).toBe(600_000);
  expect(evalTurnTimeoutMs({ RELAYER_EVAL_TURN_TIMEOUT_MS: "1800000" })).toBe(1_800_000);
  expect(evalTurnTimeoutMs({ RELAYER_EVAL_TURN_TIMEOUT_MS: "-1" })).toBe(600_000);
});
