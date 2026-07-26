import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export const ADMIN_OPEN_ID = "admin";

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signAdminSession(
  expiresInMs: number = ONE_YEAR_MS
): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ openId: ADMIN_OPEN_ID })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

async function verifySession(
  token: string | undefined
): Promise<{ openId: string } | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const { openId } = payload as Record<string, unknown>;
    return typeof openId === "string" && openId.length > 0 ? { openId } : null;
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const session = await verifySession(cookies[COOKIE_NAME]);
  if (!session) return null;

  return (await db.getUserByOpenId(session.openId)) ?? null;
}
