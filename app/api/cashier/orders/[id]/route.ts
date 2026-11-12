import { NextRequest, NextResponse } from "next/server";

import { getCashierSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applyOrderStatus, isOrderStatus } from "@/lib/order-status";

export const runtime = "nodejs";

// Кассир может двигать заказ вперёд по шагам или отменить его.
const allowedTransitions: Record<string, Set<string>> = {
  new: new Set(["new", "accepted", "cooking", "canceled"]),
  accepted: new Set(["accepted", "cooking", "ready", "on_way", "canceled"]),
  cooking: new Set(["cooking", "ready", "on_way", "delivered", "canceled"]),
  ready: new Set(["ready", "on_way", "delivered", "canceled"]),
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
  if (!isOrderStatus(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const order = getDb()
    .prepare("SELECT id, status FROM orders WHERE id = ?")
    .get(id) as { id: number; status: string } | undefined;
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!allowedTransitions[order.status]?.has(nextStatus)) {
    return NextResponse.json(
      { error: `Нельзя изменить статус ${order.status} на ${nextStatus}` },
      { status: 409 },
    );
  }

  // Бонусы начисляются внутри applyOrderStatus только при переходе в «delivered».
  const result = applyOrderStatus(id, nextStatus, { cancelReason });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
