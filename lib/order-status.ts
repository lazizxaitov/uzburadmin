import "server-only";

import { getDb, nowIso } from "@/lib/db";

/**
 * Статусы заказа Uzbur (по порядку):
 * new → accepted → cooking → ready → on_way → delivered; canceled — в любой момент.
 */
export const ORDER_STATUSES = [
  "new",
  "accepted",
  "cooking",
  "ready",
  "on_way",
  "delivered",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const RANK: Record<OrderStatus, number> = {
  new: 0,
  accepted: 1,
  cooking: 2,
  ready: 3,
  on_way: 4,
  delivered: 5,
  canceled: 6,
};

export const FINAL_STATUSES: OrderStatus[] = ["delivered", "canceled"];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Статус доставки iiko (DeliveryStatus) → статус Uzbur. */
export function mapIikoStatus(status: string): OrderStatus | null {
  switch (status) {
    case "Unconfirmed":
      return "new";
    case "WaitCooking":
    case "ReadyForCooking":
      return "accepted";
    case "CookingStarted":
      return "cooking";
    case "CookingCompleted":
    case "Waiting":
      return "ready";
    case "OnWay":
      return "on_way";
    // Бонусы начисляются только здесь — после Delivered / Closed.
    case "Delivered":
    case "Closed":
      return "delivered";
    case "Cancelled":
      return "canceled";
    default:
      return null;
  }
}

type OrderRow = {
  id: number;
  external_id: string | null;
  customer_phone: string;
  status: string;
  bonus_earned: number;
  bonus_applied: number;
};

export type ApplyStatusResult =
  | { ok: true; changed: boolean; status: OrderStatus }
  | { ok: false; error: string };

/**
 * Меняет статус заказа и, если он стал «delivered», один раз начисляет бонусы.
 * forwardOnly — для статусов из iiko: статус не откатывается назад
 * (вебхуки могут прийти не по порядку), финальные статусы не меняются.
 */
export function applyOrderStatus(
  orderId: number,
  nextStatus: OrderStatus,
  {
    forwardOnly = false,
    cancelReason = "",
    iikoStatus,
  }: { forwardOnly?: boolean; cancelReason?: string; iikoStatus?: string } = {},
): ApplyStatusResult {
  const db = getDb();
  const order = db.prepare(`
    SELECT id, external_id, customer_phone, status, bonus_earned, bonus_applied
    FROM orders WHERE id = ?
  `).get(orderId) as OrderRow | undefined;
  if (!order) return { ok: false, error: "Заказ не найден" };

  const current = isOrderStatus(order.status) ? order.status : "new";
  if (iikoStatus !== undefined) {
    db.prepare("UPDATE orders SET iiko_status = ? WHERE id = ?").run(iikoStatus, orderId);
  }
  if (current === nextStatus) return { ok: true, changed: false, status: current };
  if (forwardOnly) {
    if (FINAL_STATUSES.includes(current)) return { ok: true, changed: false, status: current };
    if (nextStatus !== "canceled" && RANK[nextStatus] < RANK[current]) {
      return { ok: true, changed: false, status: current };
    }
  }

  const now = nowIso();
  const fields = ["status = ?", "updated_at = ?"];
  const values: Array<string | number> = [nextStatus, now];
  const timestampColumn: Partial<Record<OrderStatus, string>> = {
    accepted: "accepted_at",
    on_way: "on_way_at",
    delivered: "delivered_at",
    canceled: "canceled_at",
  };
  const column = timestampColumn[nextStatus];
  if (column) {
    fields.push(`${column} = COALESCE(${column}, ?)`);
    values.push(now);
  }
  if (nextStatus === "canceled" && cancelReason) {
    fields.push("cancel_reason = ?");
    values.push(cancelReason);
  }

  db.transaction(() => {
    db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id = ?`).run(...values, orderId);
    if (nextStatus === "delivered") creditBonus(order, now);
  })();

  return { ok: true, changed: true, status: nextStatus };
}

/** Начисление бонусов за доставленный заказ (идемпотентно). */
function creditBonus(order: OrderRow, now: string) {
  const db = getDb();
  const settings = db.prepare("SELECT bonus_enabled FROM settings WHERE id = 1").get() as
    | { bonus_enabled?: number }
    | undefined;
  const amount = Math.max(0, Number(order.bonus_earned ?? 0));
  if (Number(settings?.bonus_enabled ?? 1) !== 1 || Number(order.bonus_applied ?? 0) === 1 || amount === 0) {
    return;
  }
  const customer = db.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").get(order.customer_phone) as
    | { id: number }
    | undefined;
  if (!customer) return;

  const inserted = db.prepare(`
    INSERT OR IGNORE INTO bonus_transactions
      (customer_id, order_id, amount, transaction_type, description, created_at)
    VALUES (?, ?, ?, 'earned', ?, ?)
  `).run(customer.id, order.id, amount, `Начисление за заказ ${order.external_id || `#${order.id}`}`, now);
  if (inserted.changes > 0) {
    db.prepare("UPDATE customers SET bonus_balance = bonus_balance + ?, updated_at = ? WHERE id = ?")
      .run(amount, now, customer.id);
  }
  db.prepare("UPDATE orders SET bonus_applied = 1 WHERE id = ?").run(order.id);
}
