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
      `SELECT id, status, accepted_at, on_way_at, delivered_at, canceled_at, customer_phone, external_id
      `SELECT id, status, accepted_at, on_way_at, delivered_at, canceled_at
       FROM orders
       WHERE id = ?`
    )
    .get(id) as
    | {
        id: number;
        status: string;
        accepted_at: string | null;
        on_way_at: string | null;
        delivered_at: string | null;
        canceled_at: string | null;
      }
    | undefined;

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}
