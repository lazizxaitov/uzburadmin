import "server-only";

import { getDb } from "@/lib/db";
import { createIikoDelivery } from "@/lib/iiko";
import type { PreparedOrder } from "@/lib/public-orders";

type IikoOrderSyncResult =
  | { ok: true; status: "success" | "skipped"; orderId: string; correlationId: string; message: string }
  | { ok: false; status: "failed"; message: string };

type IikoOrderSettings = {
  base_url: string;
  api_login: string;
  organization_id: string;
  terminal_group_id: string;
  order_type_id: string;
  payment_type_id: string;
  payment_type_kind: string;
  send_orders_to_iiko: number;
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export async function sendOrderToIiko(prepared: PreparedOrder): Promise<IikoOrderSyncResult> {
  const db = getDb();
  const settings = db.prepare("SELECT * FROM iiko_settings WHERE id = 1").get() as IikoOrderSettings;
  if (Number(settings?.send_orders_to_iiko ?? 0) !== 1) {
    return { ok: true, status: "skipped", orderId: "", correlationId: "", message: "iiko order sync disabled" };
  }

  const organizationId = settings.organization_id.trim();
  if (!organizationId) {
    return { ok: false, status: "failed", message: "Organization ID iiko не заполнен" };
  }

  const ids = [...new Set(prepared.normalizedItems.map((item) => item.productId))];
  const rows = db.prepare(`
    SELECT id, iiko_id FROM products
    WHERE id IN (${ids.map(() => "?").join(",")})
  `).all(...ids) as Array<{ id: number; iiko_id: string | null }>;
  const iikoIdByProductId = new Map(rows.map((item) => [item.id, item.iiko_id?.trim() || ""]));

  for (const item of prepared.normalizedItems) {
    if (!iikoIdByProductId.get(item.productId)) {
      return { ok: false, status: "failed", message: `У товара ID ${item.productId} нет iiko_id` };
    }
  }

  const paymentTypeId = settings.payment_type_id.trim();
  const isPaid = prepared.payment.method === "card" && prepared.payment.status === "paid";
  const payments = isPaid && paymentTypeId
    ? [{
        paymentTypeKind: settings.payment_type_kind || "Card",
        sum: prepared.total,
        paymentTypeId,
        isProcessedExternally: true,
        isPrepay: true,
      }]
    : undefined;

  const payload = {
    organizationId,
    terminalGroupId: settings.terminal_group_id.trim() || undefined,
    createOrderSettings: { checkStopList: true, transportToFrontTimeout: 15 },
    order: {
      externalNumber: prepared.externalId,
      phone: normalizePhone(prepared.customerPhone),
      orderTypeId: settings.order_type_id.trim() || undefined,
      deliveryPoint: prepared.addressText
        ? {
            comment: prepared.addressText,
            ...(prepared.address?.latitude != null && prepared.address?.longitude != null
              ? { coordinates: { latitude: prepared.address.latitude, longitude: prepared.address.longitude } }
              : {}),
          }
        : undefined,
      comment: `Uzbur ${prepared.externalId}`,
      customer: { type: "one-time", name: prepared.customerName },
      items: prepared.normalizedItems.map((item) => ({
        type: "Product",
        productId: iikoIdByProductId.get(item.productId),
        amount: item.quantity,
        price: item.price,
      })),
      ...(payments ? { payments } : {}),
      sourceKey: "uzbur-mobile",
    },
  };

  try {
    const response = await createIikoDelivery(settings, payload);
    const orderInfo = response.orderInfo as Record<string, unknown> | undefined;
    const orderId = String(orderInfo?.id ?? orderInfo?.orderId ?? "");
    const correlationId = String(response.correlationId ?? "");
    if (!orderId && !correlationId) throw new Error("iiko не вернул данные заказа");
    return { ok: true, status: "success", orderId, correlationId, message: "iiko order created" };
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "iiko order sync failed" };
  }
}
