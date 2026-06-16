import "server-only";

import { getDb } from "@/lib/db";

type PlumResult<T> = {
  result?: T | null;
  error?: unknown;
};

function getPlumConfig() {
  const settings = getDb()
    .prepare(`
      SELECT plum_base_url, plum_username, plum_password
      FROM settings
      WHERE id = 1
    `)
    .get() as
    | {
        plum_base_url?: string | null;
        plum_username?: string | null;
        plum_password?: string | null;
      }
    | undefined;

  const baseUrl =
    settings?.plum_base_url?.trim() ||
    process.env.PLUM_BASE_URL?.trim() ||
    "https://pay.myuzcard.uz";
  const username =
    settings?.plum_username?.trim() || process.env.PLUM_USERNAME?.trim() || "";
  const password =
    settings?.plum_password?.trim() || process.env.PLUM_PASSWORD?.trim() || "";
  return { baseUrl, username, password };
}

function getAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error.trim();
  if (typeof error === "object") {
    const map = error as Record<string, unknown>;
    const message = map.message?.toString().trim();
    const id = map.identifier?.toString().trim();
    const code = map.code?.toString().trim();
    return [message, id, code].filter(Boolean).join(" ").trim();
  }
  return String(error).trim();
}

async function plumRequest<T>(path: string, body: Record<string, unknown>) {
  const { baseUrl, username, password } = getPlumConfig();
  if (!username || !password) {
    throw new Error("Plum credentials are not configured");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(username, password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as PlumResult<T> | null;
  if (!response.ok) {
    throw new Error(normalizeError(json?.error) || "Plum request failed");
  }

  if (json?.error) {
    throw new Error(normalizeError(json.error) || "Plum returned an error");
  }

  if (!json?.result) {
    throw new Error("Plum returned empty result");
  }

  return json.result;
}

export type PlumStartPaymentResult = {
  session: number;
  transactionId: number;
  otpSentPhone?: string;
};

export type PlumConfirmPaymentResult = {
  transactionId: number;
  utrno?: string;
  status?: number;
  statusComment?: string;
  terminalId?: string;
  merchantId?: string;
  cardNumber?: string;
  date?: string;
  amount?: number;
  cardId?: number;
  commission?: number;
  totalAmount?: number;
  transactionData?: string;
};

export async function plumStartPayment(input: {
  amount: number;
  cardNumber: string;
  expireDate: string;
  extraId: string;
  transactionData?: string;
}) {
  return plumRequest<PlumStartPaymentResult>("/Payment/paymentWithoutRegistration", input);
}

export async function plumConfirmPayment(input: {
  session: number;
  otp: string;
}) {
  return plumRequest<PlumConfirmPaymentResult>("/Payment/confirmPayment", input);
}

export async function plumTestConnection() {
  const today = new Date().toISOString().slice(0, 10);
  return plumRequest<{
    totalTransactions?: number;
    transactions?: Array<Record<string, unknown>>;
  }>("/Payment/getTransactions", {
    userId: null,
    transactionId: null,
    beginDate: today,
    endDate: today,
    page: 1,
    count: 1,
    transactionStatus: null,
    IsWithRegistration: null,
  });
}
