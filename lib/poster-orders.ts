import "server-only";

import { getDb } from "@/lib/db";
import { createPosterIncomingOrder } from "@/lib/poster";
import type { PreparedOrder } from "@/lib/public-orders";

type PosterOrderSyncResult =
  | {
      ok: true;
      status: "success" | "skipped";
      incomingOrderId: string;
      transactionId: string;
      message: string;
    }
  | {
      ok: false;
      status: "failed";
      message: string;
    };

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "Гость",
    lastName: parts.slice(1).join(" "),
  };
}

function toPosterMoney(value: number) {
  return Math.round(Number(value || 0) * 100);
}

export async function sendOrderToPoster(prepared: PreparedOrder): Promise<PosterOrderSyncResult> {
  const db = getDb();
  const settings = db.prepare(`
    SELECT account_name, access_token, username, password, use_token, send_orders_to_poster, order_spot_id
    FROM poster_settings
    WHERE id = 1
  `).get() as
    | {
        account_name: string;
        access_token: string;
        username: string;
        password: string;
        use_token: number;
        send_orders_to_poster: number;
        order_spot_id: string;
      }
    | undefined;

  if (!settings || Number(settings.send_orders_to_poster ?? 0) !== 1) {
    return {
      ok: true,
      status: "skipped",
      incomingOrderId: "",
      transactionId: "",
      message: "Poster order sync disabled",
    };
  }

  if (!settings.order_spot_id?.trim()) {
    return { ok: false, status: "failed", message: "Poster spot_id не заполнен" };
  }

  const productIds = [...new Set(prepared.normalizedItems.map((item) => item.productId))];
  const products = db.prepare(`
    SELECT id, poster_id
    FROM products
    WHERE id IN (${productIds.map(() => "?").join(",")})
  `).all(...productIds) as Array<{ id: number; poster_id: string | null }>;

  const posterIdByProductId = new Map(
    products.map((item) => [item.id, item.poster_id?.toString().trim() || ""]),
  );

  for (const item of prepared.normalizedItems) {
    const posterId = posterIdByProductId.get(item.productId);
    if (!posterId) {
      return {
        ok: false,
        status: "failed",
        message: `У товара ID ${item.productId} нет poster_id`,
      };
    }
    if (!Number.isFinite(Number(posterId))) {
      return {
        ok: false,
        status: "failed",
        message: `Некорректный poster_id у товара ID ${item.productId}`,
      };
    }
  }

  const { firstName, lastName } = splitName(prepared.customerName);
  const productsPayload = prepared.normalizedItems.map((item) => ({
    product_id: Number(posterIdByProductId.get(item.productId)),
    count: item.quantity,
    price: toPosterMoney(item.price),
  }));

  const paymentPayload =
    prepared.payment.method === "card" && prepared.payment.status === "paid"
      ? {
          type: 1,
          sum: toPosterMoney(prepared.total),
          currency: "UZS",
        }
      : undefined;

  try {
    const response = await createPosterIncomingOrder(settings, {
      spot_id: settings.order_spot_id.trim(),
      phone: normalizePhone(prepared.customerPhone),
      first_name: firstName,
      last_name: lastName,
      address: prepared.addressText,
      comment: `Uzbur ${prepared.externalId}`,
      products: JSON.stringify(productsPayload),
      ...(paymentPayload ? { payment: JSON.stringify(paymentPayload) } : {}),
    });

    const incomingOrderId = String(response?.["incoming_order_id"] ?? "");
    const transactionId = String(response?.["transaction_id"] ?? "");

    return {
      ok: true,
      status: "success",
      incomingOrderId,
      transactionId,
      message: "Poster order created",
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Poster order sync failed",
    };
  }
}
