// Edge-safe session token helpers (used by middleware and server code). No Node-only imports here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tm_session";
const ISSUER = "thesismate";
const AUDIENCE = "thesismate-owner";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters long.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string, hours: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${Math.round(hours * 3600)}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<{ username: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    // The token must belong to the one configured owner (changing AUTH_USERNAME invalidates old sessions).
    const owner = process.env.AUTH_USERNAME;
    if (!payload.sub || !owner || payload.sub !== owner) return null;
    return { username: payload.sub };
  } catch {
    return null;
  }
}
