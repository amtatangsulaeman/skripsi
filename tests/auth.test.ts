import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { checkLoginAllowed, MAX_ATTEMPTS, registerLoginFailure, resetLoginFailures } from "@/lib/auth/rate-limit";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
  process.env.AUTH_USERNAME = "owner";
});

describe("session tokens", () => {
  it("accepts a token issued for the owner", async () => {
    const token = await createSessionToken("owner", 1);
    expect(await verifySessionToken(token)).toEqual({ username: "owner" });
  });

  it("rejects missing, tampered and foreign tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    const token = await createSessionToken("owner", 1);
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("owner").setIssuer("thesismate").setAudience("thesismate-owner").setExpirationTime("1h").sign(new TextEncoder().encode("another-secret-another-secret-another"));
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects tokens for a different username (e.g. after AUTH_USERNAME changes)", async () => {
    const token = await createSessionToken("someone-else", 1);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await createSessionToken("owner", -1);
    expect(await verifySessionToken(token)).toBeNull();
  });
});

describe("login rate limit", () => {
  it("locks after repeated failures and unlocks on reset", () => {
    const key = "1.2.3.4";
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerLoginFailure(key, t0 + i);
    expect(checkLoginAllowed(key, t0 + 10).allowed).toBe(false);
    expect(checkLoginAllowed(key, t0 + 16 * 60 * 1000).allowed).toBe(true);
    resetLoginFailures(key);
    expect(checkLoginAllowed(key, t0 + 10).allowed).toBe(true);
  });
});
