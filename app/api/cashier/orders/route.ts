import { NextResponse } from "next/server";

import { getCashierSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCashierSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const orders = db
    .prepare(
      `SELECT
         o.id,
         o.external_id,
         o.customer_name,
         o.customer_phone,
         o.status,
         o.address_text,
         o.subtotal,
         o.delivery_fee,
         o.total,
         o.bonus_earned,
         o.payment_method,
         o.payment_provider,
         o.payment_status,
         o.payment_card_mask,
         o.poster_incoming_order_id,
         o.poster_transaction_id,
         o.poster_sync_status,
         o.poster_sync_error,
         o.accepted_at,
         o.on_way_at,
         o.delivered_at,
         o.canceled_at,
         o.cancel_reason,
         o.created_at,
         o.updated_at
       FROM orders o
       ORDER BY
         CASE o.status
           WHEN 'new' THEN 0
           WHEN 'accepted' THEN 1
           WHEN 'on_way' THEN 2
           WHEN 'delivered' THEN 3
           WHEN 'canceled' THEN 4
           ELSE 5
         END,
         o.created_at DESC`
    )
    .all() as Array<{
    id: number;
    external_id: string | null;
    customer_name: string;
    customer_phone: string;
    status: string;
    address_text: string;
    subtotal: number;
    delivery_fee: number;
    total: number;
    bonus_earned: number;
    payment_method: string | null;
    payment_provider: string | null;
    payment_status: string | null;
    payment_card_mask: string | null;
    poster_incoming_order_id: string | null;
    poster_transaction_id: string | null;
    poster_sync_status: string | null;
    poster_sync_error: string | null;
    accepted_at: string | null;
    on_way_at: string | null;
    delivered_at: string | null;
    canceled_at: string | null;
    cancel_reason: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const orderIds = orders.map((item) => item.id);
  const items = orderIds.length
    ? (db
        .prepare(
          `SELECT order_id, product_id, title, price, quantity, total
           FROM order_items
           WHERE order_id IN (${orderIds.map(() => "?").join(",")})
           ORDER BY id ASC`
        )
        .all(...orderIds) as Array<{
        order_id: number;
        product_id: number | null;
        title: string;
        price: number;
        quantity: number;
        total: number;
      }>)
    : [];

  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return NextResponse.json({
    items: orders.map((order) => ({
      ...order,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        ...item,
        product_id: item.product_id,
      })),
    })),
  });
}
