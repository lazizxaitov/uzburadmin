import "server-only";

import { getDb } from "@/lib/db";

type CustomerRow = {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  notes: string;
  bonus_balance: number;
  total_spent: number;
  total_orders: number;
  is_active: number;
};

export function getCustomerById(customerId: number) {
  return getDb()
    .prepare(
      `SELECT id, full_name, phone, email, notes, bonus_balance, total_spent, total_orders, is_active
       FROM customers
       WHERE id = ?`
    )
    .get(customerId) as CustomerRow | undefined;
}

export function serializeCustomerAccount(customerId: number) {
  const db = getDb();
  const customer = getCustomerById(customerId);
  if (!customer) return null;

  const addresses = db
    .prepare(
      `SELECT id, title, address_line, entrance, floor, comment, latitude, longitude, is_default
       FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, created_at DESC`
    )
    .all(customerId) as Array<{
    id: number;
    title: string;
    address_line: string;
    entrance: string;
    floor: string;
    comment: string;
    latitude: number | null;
    longitude: number | null;
    is_default: number;
  }>;

  const orders = db
    .prepare(
      `SELECT id, external_id, status, total, delivery_fee, subtotal, bonus_earned, created_at, address_text
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
    subtotal: number;
    bonus_earned: number;
    created_at: string;
    address_text: string;
  }>;

  const orderIds = orders.map((item) => item.id);
  const orderItems = orderIds.length
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

  const itemsByOrder = new Map<number, typeof orderItems>();
  for (const item of orderItems) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return {
    customer: {
      id: customer.id,
      fullName: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      bonusBalance: Number(customer.bonus_balance ?? 0),
      totalSpent: Number(customer.total_spent ?? 0),
      totalOrders: Number(customer.total_orders ?? 0),
    },
    addresses: addresses.map((item) => ({
      id: item.id,
      title: item.title,
      addressLine: item.address_line,
      entrance: item.entrance,
      floor: item.floor,
      comment: item.comment,
      latitude: item.latitude,
      longitude: item.longitude,
      isDefault: Number(item.is_default ?? 0) === 1,
    })),
    orders: orders.map((order) => ({
      id: order.external_id?.trim() ? order.external_id : `ORD-${order.id}`,
      status: order.status,
      total: Number(order.total ?? 0),
      subtotal: Number(order.subtotal ?? 0),
      deliveryFee: Number(order.delivery_fee ?? 0),
      bonusEarned: Number(order.bonus_earned ?? 0),
      createdAt: order.created_at,
      addressText: order.address_text,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        productId: item.product_id?.toString() ?? "",
        title: item.title,
        price: Number(item.price ?? 0),
        quantity: Number(item.quantity ?? 0),
        total: Number(item.total ?? 0),
      })),
    })),
  };
}
