import type { HarnessRunContext } from "./types.js";

/**
 * Why a root turn could not continue its thread's previous native conversation (#584).
 * Prompts carry only the current turn, so the native session is the only holder of prior
 * conversation: a reset is never silent.
 */
export type NativeSessionResetReason =
  /** The saved Codex thread lives in another Codex home, where it cannot be resumed. */
  | "home_changed"
  /** Claude: the saved session belongs to another provider definition's credentials. */
  | "provider_changed"
  /** The personal presentation pin changed, and its native instructions need a new session. */
  | "presentation_changed"
  /** Codex had no rollout for the saved thread. */
  | "no_rollout"
  /** The previous root conversation was force-stopped, or killed when the app quit. */
  | "force_stopped"
  /** A Stop killed the previous root turn while its turn/start was pending. */
  | "stopped_during_start"
  /** Saved state from an earlier release could not identify a resumable session. */
  | "session_unavailable";

const REASONS: ReadonlySet<string> = new Set<NativeSessionResetReason>([
  "home_changed", "provider_changed", "presentation_changed", "no_rollout",
  "force_stopped", "stopped_during_start", "session_unavailable",
]);

export const NATIVE_SESSION_RESET_MESSAGE =
  "Native conversation history was unavailable, so this turn started a new native session.";

export function parseNativeSessionResetReason(value: unknown): NativeSessionResetReason | undefined {
  return typeof value === "string" && REASONS.has(value) ? value as NativeSessionResetReason : undefined;
}

/**
 * Records the reset where the host records other turn diagnostics, such as a force-stop:
 * the product log and the turn's trace warning events. The log line carries no provider text.
 */
export function reportNativeSessionReset(
  context: HarnessRunContext,
  implementation: string,
  threadId: number,
  reason: NativeSessionResetReason,
): void {
  console.warn(`Started a new native ${implementation} session on thread ${threadId}`, {
    threadId,
    completionId: context.inputGraph.id,
    reason,
  });
  try {
    void Promise.resolve(context.trace.emit({
      type: "warning",
      data: { message: NATIVE_SESSION_RESET_MESSAGE, nativeSessionReset: reason },
    })).catch(() => undefined);
  } catch {
    // A trace that cannot take the warning does not fail the turn; the log line remains.
  }
}
