import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import {
  createOtpRequest,
  isOtpEnabled,
  shouldBypassOtp,
  verifyOtpRequest,
} from "@/lib/customer-otp";
import { notifyRegistration } from "@/lib/eskiz";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import {
  createCustomerSession,
  hashCustomerPassword,
  normalizePhone,
} from "@/lib/public-customer-auth";
import { serializeCustomerAccount } from "@/lib/public-customer-account";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const body = await request.json().catch(() => null);
  const fullName = body?.fullName?.toString().trim() ?? "";
  const phone = normalizePhone(body?.phone);
  const password = body?.password?.toString() ?? "";
  const otp = body?.otp?.toString().replace(/\D/g, "") ?? "";
  const requestToken = body?.requestToken?.toString().trim() ?? "";

  if (!fullName || !phone || password.trim().length < 4) {
    return NextResponse.json(
      { error: "Укажите имя, телефон и пароль" },
      { status: 400 }
    );
  }

  const db = getDb();
  const now = nowIso();
  const existing = db
    .prepare(
      `SELECT id, password_hash
       FROM customers
       WHERE phone = ?
       LIMIT 1`
    )
    .get(phone) as { id: number; password_hash: string } | undefined;

  let customerId = existing?.id ?? 0;
  const passwordHash = hashCustomerPassword(password.trim());

  if (existing?.password_hash) {
    return NextResponse.json(
      { error: "Аккаунт с таким номером уже существует" },
      { status: 409 }
    );
  }

  if (isOtpEnabled() && !shouldBypassOtp(phone) && !otp) {
    try {
      const otpRequest = await createOtpRequest({
        purpose: "register",
        phone,
        payload: {
          fullName,
          passwordHash,
        },
      });
      return NextResponse.json({
        ok: true,
        requiresOtp: true,
        requestToken: otpRequest.requestToken,
        expiresInSeconds: otpRequest.expiresInSeconds,
        phone,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось отправить SMS" },
        { status: 400 }
      );
    }
  }

  let resolvedPasswordHash = passwordHash;
  if (isOtpEnabled() && !shouldBypassOtp(phone)) {
    const verified = verifyOtpRequest({
      requestToken,
      purpose: "register",
      otp,
    });
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }
    resolvedPasswordHash =
      verified.payload.passwordHash?.toString() || resolvedPasswordHash;
  }

  if (existing) {
    db.prepare(
      `UPDATE customers
       SET full_name = ?, password_hash = ?, is_active = 1, updated_at = ?
       WHERE id = ?`
    ).run(fullName, resolvedPasswordHash, now, existing.id);
    customerId = existing.id;
  } else {
    const result = db
      .prepare(
        `INSERT INTO customers
         (full_name, phone, email, password_hash, notes, bonus_balance, total_spent, total_orders, is_active, created_at, updated_at)
         VALUES (?, ?, '', ?, '', 0, 0, 0, 1, ?, ?)`
      )
      .run(fullName, phone, resolvedPasswordHash, now, now);
    customerId = Number(result.lastInsertRowid);
  }

  const token = createCustomerSession(customerId);
  try {
    await notifyRegistration(phone, fullName);
  } catch {}
  return NextResponse.json({
    ok: true,
    token,
    account: serializeCustomerAccount(customerId),
  });
}
