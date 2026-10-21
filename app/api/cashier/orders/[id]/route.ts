import { NextRequest, NextResponse } from "next/server";

import { getCashierSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

const allowedStatuses = new Set([
  "new",
  "accepted",
  "on_way",
  "delivered",
  "canceled",
]);

const allowedTransitions: Record<string, Set<string>> = {
  new: new Set(["new", "accepted", "canceled"]),
  accepted: new Set(["accepted", "on_way", "canceled"]),
  on_way: new Set(["on_way", "delivered", "canceled"]),
  delivered: new Set(["delivered"]),
  canceled: new Set(["canceled"]),
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCashierSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const nextStatus = body?.status?.toString().trim() ?? "";
  const cancelReason = body?.cancelReason?.toString().trim() ?? "";
  if (!allowedStatuses.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getDb();
  const order = db
    .prepare(
      `SELECT id, external_id, customer_phone, status, bonus_earned, bonus_applied,
              accepted_at, on_way_at, delivered_at, canceled_at
       FROM orders
       WHERE id = ?`
    )
    .get(id) as
    | {
        id: number;
        external_id: string | null;
        customer_phone: string;
        status: string;
        bonus_earned: number;
        bonus_applied: number;
        accepted_at: string | null;
        on_way_at: string | null;
        delivered_at: string | null;
        canceled_at: string | null;
      }
    | undefined;

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!allowedTransitions[order.status]?.has(nextStatus)) {
    return NextResponse.json(
      { error: `Нельзя изменить статус ${order.status} на ${nextStatus}` },
      { status: 409 },
    );
  }

  const now = nowIso();
  const fields = ["status = ?", "updated_at = ?"];
  const values: Array<string | number | null> = [nextStatus, now];

  if (nextStatus === "accepted" && !order.accepted_at) {
    fields.push("accepted_at = ?");
    values.push(now);
  }
  if (nextStatus === "on_way" && !order.on_way_at) {
    fields.push("on_way_at = ?");
    values.push(now);
  }
  if (nextStatus === "delivered" && !order.delivered_at) {
    fields.push("delivered_at = ?");
    values.push(now);
  }
  if (nextStatus === "canceled") {
    if (!order.canceled_at) {
      fields.push("canceled_at = ?");
      values.push(now);
    }
    fields.push("cancel_reason = ?");
    values.push(cancelReason);
  }

  values.push(id);

  db.transaction(() => {
    db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    const bonusSettings = db
      .prepare("SELECT bonus_enabled FROM settings WHERE id = 1")
      .get() as { bonus_enabled?: number } | undefined;
    const bonusAmount = Math.max(0, Number(order.bonus_earned ?? 0));
    if (
      Number(bonusSettings?.bonus_enabled ?? 1) !== 1 ||
      nextStatus !== "delivered" ||
      Number(order.bonus_applied ?? 0) === 1 ||
      bonusAmount === 0
    ) {
      return;
    }

    const customer = db
      .prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1")
      .get(order.customer_phone) as { id: number } | undefined;
    if (!customer) return;

    const inserted = db.prepare(
      `INSERT OR IGNORE INTO bonus_transactions
       (customer_id, order_id, amount, transaction_type, description, created_at)
       VALUES (?, ?, ?, 'earned', ?, ?)`,
    ).run(
      customer.id,
      order.id,
      bonusAmount,
      `Начисление за заказ ${order.external_id || `#${order.id}`}`,
      now,
    );

    if (inserted.changes > 0) {
      db.prepare(
        "UPDATE customers SET bonus_balance = bonus_balance + ?, updated_at = ? WHERE id = ?",
      ).run(bonusAmount, now, customer.id);
    }
    db.prepare("UPDATE orders SET bonus_applied = 1 WHERE id = ?").run(order.id);
  })();

  return NextResponse.json({ ok: true });
}
