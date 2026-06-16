import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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
  const customer = db
    .prepare("SELECT id, phone FROM customers WHERE id = ?")
    .get(id) as { id: number; phone: string } | undefined;

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orders = db
    .prepare(
      `SELECT *
       FROM orders
       WHERE customer_phone = ?
       ORDER BY created_at DESC`
    )
    .all(customer.phone) as Array<{
      id: number;
      external_id: string | null;
      status: string;
      total: number;
      delivery_fee: number;
      created_at: string;
      address_text: string;
    }>;

  const orderIds = orders.map((item) => item.id);
  const items = orderIds.length
    ? (db
        .prepare(
          `SELECT order_id, title, price, quantity, total
           FROM order_items
           WHERE order_id IN (${orderIds.map(() => "?").join(",")})
           ORDER BY id ASC`
        )
        .all(...orderIds) as Array<{
        order_id: number;
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
      items: itemsByOrder.get(order.id) ?? [],
    })),
  });
}
