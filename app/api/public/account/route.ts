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
  const submittedPhone = body?.phone == null
    ? session.phone
    : normalizePhone(body.phone);

  if (!fullName) {
    return NextResponse.json({ error: "Укажите имя" }, { status: 400 });
  }
  if (submittedPhone !== session.phone) {
    return NextResponse.json(
      { error: "Номер телефона нельзя изменить после регистрации" },
      { status: 409 },
    );
  }

  const db = getDb();
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE customers
       SET full_name = ?, updated_at = ?
       WHERE id = ?`
    ).run(fullName, now, session.customer_id);

    db.prepare(
      "UPDATE orders SET customer_name = ?, updated_at = ? WHERE customer_phone = ?"
    ).run(fullName, now, session.phone);
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
