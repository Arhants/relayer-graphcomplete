import { randomBytes } from "node:crypto";

// The trusted host registers authority; the browser receives only this scoped token.
export async function createProductReview({ productSession, context, threadId, turnId,
  author, inputOperatorAvailable = false, fetchImpl = fetch }) {
  if (!context.readOnly || !context.cases.some((item) => item.threadIds.some((id) => String(id) === String(threadId)))) {
    throw new Error("The review thread does not belong to its execution.");
  }
  const token = randomBytes(32).toString("hex");
  const request = async (method, body) => {
    const { name, value } = productSession.cookie;
    const response = await fetchImpl(new URL("/api/internal/review-sessions", productSession.origin), {
      signal: AbortSignal.timeout(5000), method, headers: { Cookie: `${name}=${value}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Product review session ${method} failed (${response.status}).`);
  };
  await request("POST", { token, context, ...(author ? { author } : {}) });
  const url = new URL("/", productSession.origin);
  url.search = new URLSearchParams({ threadId: String(threadId), review: "1",
    ...(turnId == null ? {} : { interactionId: String(turnId) }), ...(inputOperatorAvailable ? { inputOperator: "1" } : {}) });
  url.hash = token;
  let closed;
  return { url: url.href, origin: url.origin,
    read: (path) => {
      const target = new URL(path, url);
      if (target.origin !== url.origin || !target.pathname.startsWith("/api/")) throw new Error("Review reads require a local product API path.");
      return fetchImpl(target, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(5000) });
    },
    close: () => closed ??= request("DELETE", { token }),
  };
}
