import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import { serializeCustomerAccount } from "@/lib/public-customer-account";
import {
  createCustomerSession,
  normalizePhone,
  verifyCustomerPassword,
} from "@/lib/public-customer-auth";

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
  const phone = normalizePhone(body?.phone);
  const password = body?.password?.toString() ?? "";

  if (!phone || !password.trim()) {
    return NextResponse.json(
      { error: "Укажите телефон и пароль" },
      { status: 400 }
    );
  }

  const customer = getDb()
    .prepare(
      `SELECT id, password_hash, is_active
       FROM customers
       WHERE phone = ?
       LIMIT 1`
    )
    .get(phone) as
    | {
        id: number;
        password_hash: string;
        is_active: number;
      }
    | undefined;

  if (!customer || Number(customer.is_active ?? 0) !== 1) {
    return NextResponse.json(
      { error: "Аккаунт не найден" },
      { status: 404 }
    );
  }

  if (!customer.password_hash) {
    return NextResponse.json(
      { error: "Аккаунт еще не создан, сначала зарегистрируйтесь" },
      { status: 400 }
    );
  }

  if (!verifyCustomerPassword(customer.password_hash, password.trim())) {
    return NextResponse.json(
      { error: "Неверный пароль" },
      { status: 401 }
    );
  }
  const token = createCustomerSession(customer.id);
  return NextResponse.json({
    ok: true,
    token,
    account: serializeCustomerAccount(customer.id),
  });
}
