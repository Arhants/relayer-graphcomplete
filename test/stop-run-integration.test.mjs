import { describe, it, expect } from "vitest";
import { stopRunFixture, waitFor } from "./support/stop-run-fixture.mjs";

describe("product Stop through native provider adapters", () => {
  it.each(["codex", "prime"])("%s retains work, awaits native settlement, isolates another run, and permits follow-up", async (provider) => {
    const f = await stopRunFixture();
    try {
      const first = await f.create(provider, "accept baseline");
      const id = first.id;
      await waitFor("baseline", async () => { const t = (await f.request(`/api/threads/${id}`)).interactions[0]; if (t.completionStatus === "failed" || t.completionStatus === "not_started") throw new Error(JSON.stringify(t)); return t.completionStatus === "accepted"; });
      const sent = await f.request(`/api/threads/${id}/interactions`, { method: "POST", body: JSON.stringify({ text: "stop during tool work", modelSelection: f.modelSelection }) });
      const other = await f.create(provider, "other model work");
      const turn = await waitFor("active stop target", async () => {
        const d = await f.request(`/api/threads/${id}`); const t = d.interactions.at(-1);
        return f.controls.has(t.graphNodeId) && t;
      });
      const c = f.controls.get(turn.graphNodeId); await c.started.promise;
      expect((await c.readCurrent()).lifecycle).toBe("active");
      const stop = `/api/threads/${id}/interactions/${turn.id}/stop`;
      const replies = await Promise.all([f.request(stop, { method: "POST" }), f.request(stop, { method: "POST" })]);
      expect(replies.every((r) => r.stopRequested)).toBe(true);
      await c.aborted.promise;
      expect(c.aborts).toBe(1);
      // Use the original capability after graph Stop committed, before native settlement.
      await expect(c.readCurrent()).rejects.toMatchObject({ status: 422, code: "authority_generation_expired" });
      // Submit meets the revoked asset barrier before graph authority validation.
      await expect(c.submitLate()).rejects.toMatchObject({ status: 503, code: "visual_assets_unavailable" });
      let current = (await f.request(`/api/threads/${id}`)).interactions.at(-1);
      expect(current.completionStatus).toBe("running");
      expect(current.stopRequested).toBe(true);
      const otherTurn = await waitFor("other run", async () => { const t = (await f.request(`/api/threads/${other.id}`)).interactions[0]; return f.controls.has(t.graphNodeId) && t; });
      expect(f.controls.get(otherTurn.graphNodeId).aborts).toBe(0);
      c.settled.resolve();
      current = await waitFor("stopped", async () => { const t = (await f.request(`/api/threads/${id}`)).interactions.at(-1); if (t.completionStatus === "failed") throw new Error(JSON.stringify(t)); return t.completionStatus === "stopped" && t; });
      expect(current.completionOutput).toBeNull();
      expect(current.latestAttempt.outcome).toBe("cancelled");
      const detail = await f.request(`/api/threads/${id}`);
      expect(detail.interactions[0].completionStatus).toBe("accepted");
      expect(c.partialNodeId).toBeGreaterThan(0);
      const retained = await f.request(`/api/threads/${id}/interactions/${turn.id}/layers/${c.partialLayerId}`);
      expect(JSON.stringify(retained)).toContain("Inspectable work");
      expect(JSON.stringify(retained)).not.toContain("Unaccepted draft");
      await f.request(`/api/threads/${id}/interactions`, { method: "POST", body: JSON.stringify({ text: "accept follow-up", modelSelection: f.modelSelection }) });
      await waitFor("accepted follow-up", async () => (await f.request(`/api/threads/${id}`)).interactions.at(-1).completionStatus === "accepted");
    } finally { await f.close(); }
  }, 30000);
  it.each(["codex", "prime"])("%s preserves acceptance races and reports native abort failures honestly", async (provider) => {
    const f = await stopRunFixture();
    try {
      for (const [text, expected] of [["accept race", "accepted"], ["abort failure", "failed"]]) {
        const thread = await f.create(provider, text);
        const turn = await waitFor("native work", async () => {
          const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
          return f.controls.has(t.graphNodeId) && t;
        });
        const c = f.controls.get(turn.graphNodeId); await c.started.promise;
        await f.request(`/api/threads/${thread.id}/interactions/${turn.id}/stop`, { method: "POST" });
        await c.aborted.promise;
        c.settled.resolve();
        const ended = await waitFor(expected, async () => {
          const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
          return ["accepted", "stopped", "failed"].includes(t.completionStatus) && t;
        });
        expect(ended.completionStatus).toBe(expected);
        expect(Boolean(ended.completionOutput)).toBe(expected === "accepted");
        expect(ended.latestAttempt.outcome).toBe(expected === "accepted" ? "accepted" : "execution_failed");
      }
    } finally { await f.close(); }
  }, 30000);

  it("rejects foreign and read-only authority; a failed dispatch can be retried without duplicate native cancellation", async () => {
    const f = await stopRunFixture();
    try {
      const thread = await f.create("codex", "model work");
      const turn = await waitFor("native work", async () => { const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0]; return f.controls.has(t.graphNodeId) && t; });
      const c = f.controls.get(turn.graphNodeId); await c.started.promise;
      const url = `/api/threads/${thread.id}/interactions/${turn.id}/stop`;
      await expect(f.request(`/api/threads/${thread.id+1}/interactions/${turn.id}/stop`, { method: "POST" })).rejects.toMatchObject({ status: 422 });
      await expect(f.request(url, { method: "POST", headers: { Cookie: "" } })).rejects.toMatchObject({ status: 401 });
      const readOnly = f.session.readOnlyCookie;
      await expect(f.request(url, { method: "POST", headers: { Cookie: `${readOnly.name}=${readOnly.value}` } })).rejects.toMatchObject({ status: 403 });
      await expect(f.request(`/api/completions/${turn.graphNodeId}/stop`, { method: "POST" })).rejects.toMatchObject({ status: 401 });
      const host = f.runtime.harnessHost.host;
      const nativeCancel = host.cancel.bind(host);
      let dispatches = 0;
      host.cancel = (...args) => { dispatches++; if (dispatches === 1) throw new Error("Fixture cancellation transport failed"); return nativeCancel(...args); };
      await f.request(url, { method: "POST" });
      const failed = await waitFor("stop failure", async () => { const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0]; return t.stopError && t; });
      expect(failed.completionStatus).toBe("running");
      expect(c.aborts).toBe(0);
      await Promise.all([f.request(url, { method: "POST" }), f.request(url, { method: "POST" })]);
      await c.aborted.promise;
      expect(c.aborts).toBe(1);
      c.settled.resolve();
      await waitFor("stopped", async () => (await f.request(`/api/threads/${thread.id}`)).interactions[0].completionStatus === "stopped");
      expect(dispatches).toBe(2);
    } finally { await f.close(); }
  });

  it("honors Stop received during admission before native work starts", async () => {
    const f = await stopRunFixture();
    try {
      const gate = f.holdAdmission();
      const thread = await f.create("prime", "work that must not start");
      await gate.entered.promise;
      const turn = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
      await f.request(`/api/threads/${thread.id}/interactions/${turn.id}/stop`, { method: "POST" });
      gate.release.resolve();
      await waitFor("stopped before execution", async () => { const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0]; return t.completionStatus === "stopped"; });
      expect(f.controls.size).toBe(0);
    } finally { await f.close(); }
  });

  it.each(["admission", "graph", "cleanup", "persistence"])("settles early Stop when %s fails without stranding an attempt or admission", async (failure) => {
    const f = await stopRunFixture();
    try {
      const gate = f.holdAdmission();
      const thread = await f.create("prime", "stop before native work");
      await gate.entered.promise;
      const turn = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
      await f.request(`/api/threads/${thread.id}/interactions/${turn.id}/stop`, { method: "POST" });
      if (failure === "graph") f.failGraph((r) => r.url.endsWith("/current/transitions"));
      if (failure === "cleanup") f.failGraph((r) => r.method === "DELETE" && r.url.endsWith("/capabilities"));
      if (failure === "persistence") f.rejectStoppedPersistence();
      if (failure === "admission") gate.release.reject(new Error("Fixture admission failure"));
      else gate.release.resolve();
      const ended = await waitFor("early terminal", async () => {
        const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
        return ["stopped", "failed"].includes(t.completionStatus) && t;
      });
      expect(ended.completionStatus).toBe(failure === "admission" ? "stopped" : "failed");
      expect(f.controls.size).toBe(0);
      if (failure !== "admission") {
        expect(ended.latestAttempt.outcome).toBe("execution_failed");
        await waitFor("admission released", () => f.releases === 1);
      }
    } finally { await f.close(); }
  });

  it("terminalizes a canonical active graph when restarting before Stop dispatch", async () => {
    const f = await stopRunFixture();
    try {
      const gate = f.holdAdmission();
      const thread = await f.create("prime", "restart before Stop dispatch");
      await gate.entered.promise;
      const turn = (await f.request(`/api/threads/${thread.id}`)).interactions[0];
      await f.request(`/api/threads/${thread.id}/interactions/${turn.id}/stop`, { method: "POST" });
      expect((await f.current(turn.graphNodeId)).lifecycle).toBe("active");
      await f.restartProduct();
      expect((await f.current(turn.graphNodeId)).lifecycle).toBe("failed");
      expect((await f.request(`/api/threads/${thread.id}`)).interactions[0].completionStatus).toBe("failed");
      expect(f.controls.size).toBe(0);
    } finally { await f.close(); }
  });

  it("reopens confirmed Stop and quarantines an interrupted Stop without replaying provider work", async () => {
    const f = await stopRunFixture();
    try {
      const threads = [];
      for (const label of ["confirmed", "interrupted"]) {
        const thread = await f.create("prime", `${label} model work`); threads.push(thread);
        const turn = await waitFor("native work", async () => { const t = (await f.request(`/api/threads/${thread.id}`)).interactions[0]; return f.controls.has(t.graphNodeId) && t; });
        const c = f.controls.get(turn.graphNodeId); await c.started.promise;
        await f.request(`/api/threads/${thread.id}/interactions/${turn.id}/stop`, { method: "POST" });
        await c.aborted.promise;
        if (label === "confirmed") {
          c.settled.resolve();
          await waitFor("confirmed stopped", async () => (await f.request(`/api/threads/${thread.id}`)).interactions[0].completionStatus === "stopped");
        }
      }
      await f.restartProduct();
      const confirmed = (await f.request(`/api/threads/${threads[0].id}`)).interactions[0];
      const interrupted = (await f.request(`/api/threads/${threads[1].id}`)).interactions[0];
      expect(confirmed.completionStatus).toBe("stopped");
      expect(interrupted.completionStatus).toBe("failed");
      expect(interrupted.completionError).toContain("Stop was interrupted");
      expect(f.controls.size).toBe(2);
      expect(interrupted.completionOutput).toBeNull();
    } finally { await f.close(); }
  });

});
