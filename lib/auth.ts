import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";

export const SESSION_COOKIE = "loft_admin_session";
export const CASHIER_SESSION_COOKIE = "loft_cashier_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

const ADMIN_USER = process.env.ADMIN_USER ?? "adminloft";
const ADMIN_PASS = process.env.ADMIN_PASS ?? "admin123";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-secret-change";
const CASHIER_USER = process.env.CASHIER_USER ?? "loftkassa";
const CASHIER_PASS = process.env.CASHIER_PASS ?? "kassa123";

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - (value.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest();
}

export function verifyCredentials(username: string, password: string) {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function createSessionToken(username: string, role: "admin" | "cashier" = "admin") {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = JSON.stringify({ u: username, exp, r: role });
  const payloadEncoded = base64UrlEncode(payload);
  const signatureEncoded = base64UrlEncode(sign(payloadEncoded));
  return `${payloadEncoded}.${signatureEncoded}`;
}

export function verifySessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [payloadEncoded, signatureEncoded] = token.split(".");
  if (!payloadEncoded || !signatureEncoded) return null;
  const expected = base64UrlEncode(sign(payloadEncoded));
  const signatureBuffer = Buffer.from(signatureEncoded);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  const payloadRaw = base64UrlDecode(payloadEncoded).toString("utf8");
  try {
    const payload = JSON.parse(payloadRaw) as {
      u: string;
      exp: number;
      r?: "admin" | "cashier";
    };
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.r !== "admin") {
    redirect("/login");
  }
  return session;
}

export function verifyCashierCredentials(username: string, password: string) {
  const settings = getDb()
    .prepare("SELECT cashier_username, cashier_password FROM settings WHERE id = 1")
    .get() as
    | { cashier_username?: string; cashier_password?: string }
    | undefined;
  const dbUser = settings?.cashier_username?.trim() ?? "";
  const dbPass = settings?.cashier_password?.trim() ?? "";
  const resolvedUser = dbUser || CASHIER_USER;
  const resolvedPass = dbPass || CASHIER_PASS;
  return username === resolvedUser && password === resolvedPass;
}

export async function getCashierSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CASHIER_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireCashier() {
  const session = await getCashierSession();
  if (!session || session.r !== "cashier") {
    redirect("/cashier/login");
  }
  return session;
}

export function buildSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
    secure: process.env.NODE_ENV === "production",
  };
}

export function buildCashierSessionCookie(token: string) {
  return {
    name: CASHIER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
    secure: process.env.NODE_ENV === "production",
  };
}
