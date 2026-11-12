import "server-only";

import { getDb } from "@/lib/db";
import { createIikoDelivery } from "@/lib/iiko";
import type { PreparedOrder } from "@/lib/public-orders";

type IikoOrderSyncResult =
  | { ok: true; status: "success" | "skipped"; orderId: string; correlationId: string; message: string }
  | { ok: false; status: "failed"; message: string };

type IikoOrderSettings = {
  base_url: string;
  app_id: string;
  client_secret: string;
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
  const globalSettings = db.prepare("SELECT * FROM iiko_settings WHERE id = 1").get() as IikoOrderSettings;
  if (Number(globalSettings?.send_orders_to_iiko ?? 0) !== 1) {
    return { ok: true, status: "skipped", orderId: "", correlationId: "", message: "iiko order sync disabled" };
  }

  // У филиала своя iiko: свой API ключ, организация и терминал.
  // App ID / Client Secret / адрес API — общие, из настроек iiko.
  const branch = prepared.branch;
  if (branch && !branch.iiko_api_key.trim()) {
    return { ok: false, status: "failed", message: `У филиала «${branch.name}» не указан API ключ iiko` };
  }
  const settings: IikoOrderSettings = branch
    ? {
        ...globalSettings,
        api_login: branch.iiko_api_key,
        organization_id: branch.iiko_organization_id,
        terminal_group_id: branch.iiko_terminal_group_id,
        order_type_id: branch.iiko_order_type_id,
        payment_type_id: branch.iiko_payment_type_id,
        payment_type_kind: branch.iiko_payment_type_kind || "Card",
      }
    : globalSettings;

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
      items: prepared.normalizedItems.map((item) => {
        const modifiers = (item.options?.modifiers ?? [])
          .filter((modifier) => modifier.iikoId)
          .map((modifier) => ({
            productId: modifier.iikoId,
            amount: modifier.quantity,
            price: modifier.price,
            ...(modifier.iikoGroupId ? { productGroupId: modifier.iikoGroupId } : {}),
          }));
        const sizeId = item.options?.portion?.iikoSizeId;
        return {
          type: "Product",
          productId: iikoIdByProductId.get(item.productId),
          amount: item.quantity,
          // В iiko цена позиции — без модификаторов, они передаются отдельно.
          price: modifiers.length ? item.options?.basePrice ?? item.price : item.price,
          ...(sizeId ? { productSizeId: sizeId } : {}),
          ...(modifiers.length ? { modifiers } : {}),
        };
      }),
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
