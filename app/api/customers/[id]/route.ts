import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const fullName = body?.fullName?.toString()?.trim();
  const phone = body?.phone?.toString()?.trim();
  const email = body?.email?.toString()?.trim() ?? "";
  const notes = body?.notes?.toString()?.trim() ?? "";
  const bonusBalance = Number(body?.bonusBalance ?? 0);
  const totalSpent = Number(body?.totalSpent ?? 0);
  const totalOrders = Number(body?.totalOrders ?? 0);
  const isActive = body?.isActive === false ? 0 : 1;

  if (!fullName || !phone) {
    return NextResponse.json(
      { error: "Укажите имя и телефон" },
      { status: 400 }
    );
  }

  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM customers WHERE phone = ? AND id != ?")
    .get(phone, id) as { id: number } | undefined;
  if (exists) {
    return NextResponse.json(
      { error: "Клиент с таким телефоном уже есть" },
      { status: 409 }
    );
  }

  db.prepare(
    `UPDATE customers
     SET full_name = ?, phone = ?, email = ?, notes = ?, bonus_balance = ?, total_spent = ?, total_orders = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    fullName,
    phone,
    email,
    notes,
    Number.isFinite(bonusBalance) ? bonusBalance : 0,
    Number.isFinite(totalSpent) ? totalSpent : 0,
    Number.isFinite(totalOrders) ? totalOrders : 0,
    isActive,
    nowIso(),
    id
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
