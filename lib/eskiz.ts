import "server-only";

import { getDb, nowIso } from "./db";

const ESKIZ_BASE_URL = "https://notify.eskiz.uz/api";
const TOKEN_TTL_DAYS = 30;

type EskizSettings = {
  eskiz_enabled: number;
  eskiz_email: string;
  eskiz_password: string;
  eskiz_from: string;
  eskiz_callback_url: string;
  eskiz_notify_on_register: number;
  eskiz_notify_on_order_created: number;
  eskiz_notify_on_order_status: number;
  eskiz_token: string;
  eskiz_token_expires_at: string;
};

type SendSmsInput = {
  phone: string;
  message: string;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function getEskizSettings() {
  return getDb()
    .prepare(
      `SELECT
        eskiz_enabled,
        eskiz_email,
        eskiz_password,
        eskiz_from,
        eskiz_callback_url,
        eskiz_notify_on_register,
        eskiz_notify_on_order_created,
        eskiz_notify_on_order_status,
        eskiz_token,
        eskiz_token_expires_at
      FROM settings
      WHERE id = 1`
    )
    .get() as EskizSettings | undefined;
}

function isTokenFresh(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > Date.now() + 60 * 60 * 1000;
}

async function loginEskiz(settings: EskizSettings) {
  const form = new FormData();
  form.set("email", settings.eskiz_email.trim());
  form.set("password", settings.eskiz_password.trim());

  const response = await fetch(`${ESKIZ_BASE_URL}/auth/login`, {
    method: "POST",
    body: form,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message?.toString() || data?.error?.toString() || "Eskiz auth failed");
  }

  const token =
    data?.data?.token?.toString() ||
    data?.token?.toString() ||
    "";
  if (!token) {
    throw new Error("Eskiz token not returned");
  }

  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  getDb()
    .prepare(
      `UPDATE settings
       SET eskiz_token = ?, eskiz_token_expires_at = ?, updated_at = ?
       WHERE id = 1`
    )
    .run(token, expiresAt, nowIso());

  return token;
}

async function getEskizToken(settings: EskizSettings) {
  if (settings.eskiz_token.trim() && isTokenFresh(settings.eskiz_token_expires_at)) {
    return settings.eskiz_token.trim();
  }
  return loginEskiz(settings);
}

export async function sendEskizSms({ phone, message }: SendSmsInput) {
  const settings = getEskizSettings();
  if (!settings || Number(settings.eskiz_enabled ?? 0) !== 1) {
    return { ok: false, skipped: true, error: "Eskiz disabled" };
  }
  if (!settings.eskiz_email.trim() || !settings.eskiz_password.trim()) {
    return { ok: false, skipped: true, error: "Eskiz credentials missing" };
  }

  const normalizedPhone = digitsOnly(phone);
  if (!normalizedPhone) {
    return { ok: false, skipped: true, error: "Phone is empty" };
  }

  const token = await getEskizToken(settings);
  const form = new FormData();
  form.set("mobile_phone", normalizedPhone);
  form.set("message", message.trim());
  form.set("from", settings.eskiz_from.trim() || "4546");
  if (settings.eskiz_callback_url.trim()) {
    form.set("callback_url", settings.eskiz_callback_url.trim());
  }

  const response = await fetch(`${ESKIZ_BASE_URL}/message/sms/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message?.toString() || data?.error?.toString() || "Eskiz send failed");
  }

  return { ok: true, data };
}

export async function testEskizConnection() {
  const settings = getEskizSettings();
  if (!settings) {
    throw new Error("Eskiz settings not found");
  }
  if (!settings.eskiz_email.trim() || !settings.eskiz_password.trim()) {
    throw new Error("Укажите email и пароль Eskiz");
  }
  const token = await getEskizToken(settings);
  return { ok: true, tokenPreview: `${token.slice(0, 8)}...` };
}

export async function notifyRegistration(phone: string, customerName: string) {
  const settings = getEskizSettings();
  if (!settings || Number(settings.eskiz_notify_on_register ?? 0) !== 1) return;
  await sendEskizSms({
    phone,
    message: `Uzbur: ${customerName || "Mijoz"}, ro'yxatdan o'tish muvaffaqiyatli yakunlandi.`,
  });
}
