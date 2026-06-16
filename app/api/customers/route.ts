import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const items = db
    .prepare(`
      SELECT
        c.*,
        CASE
          WHEN COUNT(o.id) > 0 THEN COUNT(o.id)
          ELSE c.total_orders
        END as total_orders,
        CASE
          WHEN COUNT(o.id) > 0 THEN COALESCE(SUM(o.total), 0)
          ELSE c.total_spent
        END as total_spent,
        MAX(o.created_at) as last_order_at
      FROM customers c
      LEFT JOIN orders o
        ON o.customer_phone = c.phone
       AND o.status != 'cancelled'
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `)
    .all();

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    .prepare("SELECT id FROM customers WHERE phone = ?")
    .get(phone) as { id: number } | undefined;
  if (exists) {
    return NextResponse.json(
      { error: "Клиент с таким телефоном уже есть" },
      { status: 409 }
    );
  }

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO customers
       (full_name, phone, email, notes, bonus_balance, total_spent, total_orders, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fullName,
      phone,
      email,
      notes,
      Number.isFinite(bonusBalance) ? bonusBalance : 0,
      Number.isFinite(totalSpent) ? totalSpent : 0,
      Number.isFinite(totalOrders) ? totalOrders : 0,
      isActive,
      now,
      now
    );

  return NextResponse.json({ id: result.lastInsertRowid });
}
