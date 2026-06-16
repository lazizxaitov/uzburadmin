import "server-only";

import crypto from "node:crypto";

import { getDb, nowIso } from "@/lib/db";

export function normalizePhone(value: unknown) {
  const raw = value?.toString().trim() ?? "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("998")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function hashCustomerPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyCustomerPassword(hash: string, password: string) {
  const [salt, stored] = hash.split(":");
  if (!salt || !stored) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");
  if (storedBuffer.length !== derived.length) return false;
  return crypto.timingSafeEqual(storedBuffer, derived);
}

export function createCustomerSession(customerId: number) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const now = nowIso();
  db.prepare(
    `INSERT INTO customer_sessions (customer_id, token, is_active, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)`
  ).run(customerId, token, now, now);
  return token;
}

export function revokeCustomerSession(token: string) {
  if (!token) return;
  getDb()
    .prepare("UPDATE customer_sessions SET is_active = 0, updated_at = ? WHERE token = ?")
    .run(nowIso(), token);
}

export function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

export function requireCustomerSession(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const db = getDb();
  const session = db
    .prepare(
      `SELECT s.token, s.customer_id, c.id, c.full_name, c.phone, c.email, c.notes, c.bonus_balance, c.total_spent, c.total_orders, c.is_active
       FROM customer_sessions s
       INNER JOIN customers c ON c.id = s.customer_id
       WHERE s.token = ? AND s.is_active = 1
       LIMIT 1`
    )
    .get(token) as
    | {
        token: string;
        customer_id: number;
        id: number;
        full_name: string;
        phone: string;
        email: string;
        notes: string;
        bonus_balance: number;
        total_spent: number;
        total_orders: number;
        is_active: number;
      }
    | undefined;
  if (!session || Number(session.is_active ?? 0) !== 1) {
    return null;
  }
  return session;
}
