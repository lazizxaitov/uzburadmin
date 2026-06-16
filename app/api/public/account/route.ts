import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import { serializeCustomerAccount } from "@/lib/public-customer-account";
import {
  normalizePhone,
  requireCustomerSession,
  revokeCustomerSession,
} from "@/lib/public-customer-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const session = requireCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    account: serializeCustomerAccount(session.customer_id),
  });
}

export async function PUT(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const session = requireCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const fullName = body?.fullName?.toString().trim() ?? "";
  const phone = normalizePhone(body?.phone);

  if (!fullName || !phone) {
    return NextResponse.json(
      { error: "Укажите имя и телефон" },
      { status: 400 }
    );
  }

  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM customers WHERE phone = ? AND id != ?")
    .get(phone, session.customer_id) as { id: number } | undefined;
  if (exists) {
    return NextResponse.json(
      { error: "Клиент с таким телефоном уже существует" },
      { status: 409 }
    );
  }

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE customers
       SET full_name = ?, phone = ?, updated_at = ?
       WHERE id = ?`
    ).run(fullName, phone, now, session.customer_id);

    if (phone !== session.phone) {
      db.prepare(
        "UPDATE orders SET customer_name = ?, customer_phone = ?, updated_at = ? WHERE customer_phone = ?"
      ).run(fullName, phone, now, session.phone);
    } else {
      db.prepare(
        "UPDATE orders SET customer_name = ?, updated_at = ? WHERE customer_phone = ?"
      ).run(fullName, now, phone);
    }
  })();

  return NextResponse.json({
    ok: true,
    account: serializeCustomerAccount(session.customer_id),
  });
}

export async function DELETE(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const session = requireCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revokeCustomerSession(session.token);
  return NextResponse.json({ ok: true });
}
