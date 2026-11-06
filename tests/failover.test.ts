import { beforeEach, describe, expect, it } from "vitest";
import { AiError, toAiError } from "@/lib/ai/errors";
import { assertQuotaAvailable, cooldownMs, orderCandidates, resetCooldowns, runWithFailover, type Candidate } from "@/lib/ai/failover";

const quota = (msg = "RESOURCE_EXHAUSTED: quota exceeded. Please retry in 30s") => Object.assign(new Error(msg), { status: 429 });

beforeEach(() => resetCooldowns());

describe("Gemini key failover", () => {
  it("switches to key 2 when key 1 is out of quota, and remembers it", async () => {
    const calls: string[] = [];
    const call = async (c: Candidate) => {
      calls.push(`k${c.keyIndex}`);
      if (c.keyIndex === 0) throw quota();
      return "ok";
    };
    const first = await runWithFailover(orderCandidates(2, ["flash"]), call, { backoffMs: 1 });
    expect(first.value).toBe("ok");
    expect(first.candidate.keyIndex).toBe(1);
    expect(calls).toEqual(["k0", "k1"]);

    // Next request goes straight to key 2 while key 1 is resting.
    calls.length = 0;
    await runWithFailover(orderCandidates(2, ["flash"]), call, { backoffMs: 1 });
    expect(calls).toEqual(["k1"]);
  });

  it("falls back to the second model when every key is exhausted on the primary model", async () => {
    const call = async (c: Candidate) => {
      if (c.model === "flash") throw quota();
      return c.model;
    };
    const r = await runWithFailover(orderCandidates(2, ["flash", "flash-lite"]), call, { backoffMs: 1 });
    expect(r.value).toBe("flash-lite");
    expect(r.switched).toBe(2);
  });

  it("reports a clear error when all keys are exhausted", async () => {
    await expect(runWithFailover(orderCandidates(2, ["flash"]), async () => { throw quota(); }, { backoffMs: 1 })).rejects.toMatchObject({
      code: "rate_limited",
      message: expect.stringContaining("Semua API key"),
    });
  });

  it("does not switch keys for content problems", async () => {
    const calls: number[] = [];
    await expect(
      runWithFailover(orderCandidates(2, ["flash"]), async (c) => {
        calls.push(c.keyIndex);
        throw new AiError("blocked", "blocked", 422);
      }, { backoffMs: 1 }),
    ).rejects.toMatchObject({ code: "blocked" });
    expect(calls).toEqual([0]);
  });

  it("retries a transient 5xx on the same key before switching", async () => {
    const calls: number[] = [];
    let n = 0;
    const r = await runWithFailover(orderCandidates(2, ["flash"]), async (c) => {
      calls.push(c.keyIndex);
      if (n++ === 0) throw Object.assign(new Error("internal"), { status: 503 });
      return "ok";
    }, { backoffMs: 1 });
    expect(r.value).toBe("ok");
    expect(calls).toEqual([0, 0]);
  });

  it("uses the server retry hint, and rests daily-quota keys longer", () => {
    const err = new AiError("rate_limited", "x", 429);
    expect(cooldownMs(err, "Please retry in 23.5s")).toBe(24_000); // rounded up: never retry too early
    const daily = cooldownMs(err, "Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel");
    expect(daily).toBeGreaterThanOrEqual(60_000);
    expect(daily).toBeLessThanOrEqual(86_400_000); // rests until the Pacific-midnight reset
  });

  it("classifies daily vs per-minute quota errors with a retry time", () => {
    const perMinute = toAiError(quota("RESOURCE_EXHAUSTED. Please retry in 40s"));
    expect(perMinute).toMatchObject({ code: "rate_limited", retryAfterSec: 40 });
    const daily = toAiError(quota("Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, GenerateRequestsPerDayPerProjectPerModel-FreeTier"));
    expect(daily.code).toBe("quota_exhausted");
    expect(daily.message).toContain("WIB");
    expect(daily.retryAfterSec).toBeGreaterThan(0);
  });

  it("reports daily exhaustion on every key, then fails fast without calling Gemini", async () => {
    const dailyErr = () => quota("Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel");
    await expect(runWithFailover(orderCandidates(2, ["flash"]), async () => { throw dailyErr(); }, { backoffMs: 1 })).rejects.toMatchObject({
      code: "quota_exhausted",
      message: expect.stringContaining("kuota harian"),
    });
    expect(() => assertQuotaAvailable(2, ["flash"])).toThrowError(/kuota harian/);
    // A model that never failed is still available.
    expect(() => assertQuotaAvailable(2, ["flash", "flash-lite"])).not.toThrow();
  });
});
