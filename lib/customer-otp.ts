import "server-only";

import crypto from "node:crypto";

import { getDb, nowIso } from "./db";
import { sendEskizSms } from "./eskiz";

const OTP_TTL_MINUTES = 5;
const REVIEW_PHONE = "+998997447744";

type OtpPurpose = "register" | "login";

type CreateOtpInput = {
  purpose: OtpPurpose;
  phone: string;
  payload: Record<string, unknown>;
};

function createCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function createRequestToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function isOtpEnabled() {
  const row = getDb()
    .prepare("SELECT eskiz_enabled FROM settings WHERE id = 1")
    .get() as { eskiz_enabled?: number } | undefined;
  return Number(row?.eskiz_enabled ?? 0) === 1;
}

export function shouldBypassOtp(phone: string) {
  return phone.trim() == REVIEW_PHONE;
}

export async function createOtpRequest({ purpose, phone, payload }: CreateOtpInput) {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
  const requestToken = createRequestToken();
  const code = createCode();
  const createdAt = nowIso();

  db.prepare(
    `UPDATE customer_otp_requests
     SET is_used = 1, updated_at = ?
     WHERE phone = ? AND purpose = ? AND is_used = 0`
  ).run(createdAt, phone, purpose);

  db.prepare(
    `INSERT INTO customer_otp_requests (
      request_token, purpose, phone, code, payload_json, expires_at,
      attempts, is_used, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(
    requestToken,
    purpose,
    phone,
    code,
    JSON.stringify(payload),
    expiresAt.toISOString(),
    createdAt,
    createdAt
  );

  await sendEskizSms({
    phone,
    message: `Uzbur tasdiqlash kodi: ${code}`,
  });

  return {
    requestToken,
    expiresInSeconds: OTP_TTL_MINUTES * 60,
  };
}

export function verifyOtpRequest(input: {
  requestToken: string;
  purpose: OtpPurpose;
  otp: string;
}) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, phone, code, payload_json, expires_at, attempts, is_used
       FROM customer_otp_requests
       WHERE request_token = ? AND purpose = ?
       LIMIT 1`
    )
    .get(input.requestToken, input.purpose) as
    | {
        id: number;
        phone: string;
        code: string;
        payload_json: string;
        expires_at: string;
        attempts: number;
        is_used: number;
      }
    | undefined;

  if (!row) {
    return { ok: false as const, status: 404, error: "Код подтверждения не найден" };
  }
  if (Number(row.is_used ?? 0) === 1) {
    return { ok: false as const, status: 400, error: "Код уже использован" };
  }
  if ((row.attempts ?? 0) >= 5) {
    return { ok: false as const, status: 429, error: "Слишком много попыток" };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, status: 400, error: "Срок действия кода истек" };
  }

  if (row.code !== input.otp) {
    db.prepare(
      `UPDATE customer_otp_requests
       SET attempts = attempts + 1, updated_at = ?
       WHERE id = ?`
    ).run(nowIso(), row.id);
    return { ok: false as const, status: 401, error: "Неверный код" };
  }

  db.prepare(
    `UPDATE customer_otp_requests
     SET is_used = 1, updated_at = ?
     WHERE id = ?`
  ).run(nowIso(), row.id);

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json || "{}") as Record<string, unknown>;
  } catch {}

  return {
    ok: true as const,
    phone: row.phone,
    payload,
  };
}
