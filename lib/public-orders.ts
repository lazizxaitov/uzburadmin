import { getDb, nowIso } from "@/lib/db";

export type OrderItemInput = {
  productId: number;
  quantity: number;
};

export type AddressInput = {
  title?: string;
  addressLine?: string;
  entrance?: string;
  floor?: string;
  comment?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type PaymentInput = {
  method?: string;
  provider?: string;
  transactionId?: number | null;
  session?: number | null;
  cardNumber?: string;
  status?: string;
};

export type PreparedOrder = {
  customerName: string;
  customerPhone: string;
  address: AddressInput | null;
  normalizedItems: Array<{
    productId: number;
    title: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  bonusEarned: number;
  addressText: string;
  externalId: string;
  payment: PaymentInput;
};

export type OrderSyncMeta = {
  posterIncomingOrderId?: string;
  posterTransactionId?: string;
  posterSyncStatus?: string;
  posterSyncError?: string;
};

function toPositiveInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.round(number);
}

function buildAddressText(address: AddressInput | null | undefined) {
  if (!address) return "";
  const parts = [
    address.title?.toString().trim(),
    address.addressLine?.toString().trim(),
    address.entrance?.toString().trim() ? `Подъезд: ${address.entrance}` : "",
    address.floor?.toString().trim() ? `Этаж: ${address.floor}` : "",
    address.comment?.toString().trim() ? `Комментарий: ${address.comment}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function buildExternalId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 900 + 100);
  return `UZB-${stamp}-${random}`;
}

export function preparePublicOrder(body: unknown):
  | { ok: true; value: PreparedOrder }
  | { ok: false; status: number; error: string } {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const customerName = payload.customerName?.toString()?.trim() || "Гость";
  const customerPhone = payload.customerPhone?.toString()?.trim() ?? "";
  const address = (payload.address ?? null) as AddressInput | null;
  const payment = (payload.payment ?? {}) as PaymentInput;
  const itemsRaw: unknown[] = Array.isArray(payload.items) ? payload.items : [];

  const items = itemsRaw
    .map((item: unknown): OrderItemInput | null => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      const productId = toPositiveInt(record?.productId);
      const quantity = toPositiveInt(record?.quantity);
      if (!productId || !quantity) return null;
      return { productId, quantity };
    })
    .filter((item: OrderItemInput | null): item is OrderItemInput => item !== null);

  if (!items.length) {
    return { ok: false, status: 400, error: "Добавьте товары в заказ" };
  }

  const db = getDb();
  const settings = db.prepare(`
    SELECT delivery_fee, min_order, bonus_percent
    FROM settings
    WHERE id = 1
  `).get() as
    | {
        delivery_fee?: number;
        min_order?: number;
        bonus_percent?: number;
      }
    | undefined;

  const productIds = [...new Set(items.map((item: OrderItemInput) => item.productId))];
  const products = db.prepare(`
    SELECT id, title_ru, price, is_active
    FROM products
    WHERE id IN (${productIds.map(() => "?").join(",")})
  `).all(...productIds) as Array<{
    id: number;
    title_ru: string;
    price: number;
    is_active: number;
  }>;

  const productsById = new Map(products.map((item) => [item.id, item]));
  if (productsById.size !== productIds.length) {
    return { ok: false, status: 400, error: "Часть товаров не найдена" };
  }

  const inactiveProduct = products.find((item) => Number(item.is_active ?? 0) !== 1);
  if (inactiveProduct) {
    return { ok: false, status: 400, error: "Один из товаров сейчас недоступен" };
  }

  const normalizedItems = items.map((item: OrderItemInput) => {
    const product = productsById.get(item.productId)!;
    const price = Number(product.price ?? 0);
    return {
      productId: product.id,
      title: product.title_ru,
      price,
      quantity: item.quantity,
      total: price * item.quantity,
    };
  });

  const subtotal = normalizedItems.reduce(
    (sum: number, item: { total: number }) => sum + item.total,
    0
  );
  const minOrder = Number(settings?.min_order ?? 0);
  if (minOrder > 0 && subtotal < minOrder) {
    return { ok: false, status: 400, error: `Минимальный заказ ${minOrder}` };
  }

  const deliveryFee = Number(settings?.delivery_fee ?? 0);
  const total = subtotal + deliveryFee;
  const bonusPercent = Number(settings?.bonus_percent ?? 0);
  const bonusEarned = Math.round(subtotal * (bonusPercent / 100));

  return {
    ok: true,
    value: {
      customerName,
      customerPhone,
      address,
      normalizedItems,
      subtotal,
      deliveryFee,
      total,
      bonusEarned,
      addressText: buildAddressText(address),
      externalId: buildExternalId(),
      payment,
    },
  };
}

export function createPublicOrder(prepared: PreparedOrder, syncMeta: OrderSyncMeta = {}) {
  const db = getDb();
  const now = nowIso();

  const transaction = db.transaction(() => {
    const orderResult = db.prepare(`
      INSERT INTO orders (
        external_id, customer_name, customer_phone, status, address_text,
        subtotal, delivery_fee, total, bonus_earned, source, payment_method, payment_provider,
        payment_status, payment_transaction_id, payment_session, payment_card_mask,
        poster_incoming_order_id, poster_transaction_id, poster_sync_status, poster_sync_error,
        created_at, updated_at
      )
      VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, 'mobile', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prepared.externalId,
      prepared.customerName,
      prepared.customerPhone,
      prepared.addressText,
      prepared.subtotal,
      prepared.deliveryFee,
      prepared.total,
      prepared.bonusEarned,
      prepared.payment.method?.toString().trim() || "cash",
      prepared.payment.provider?.toString().trim() || "",
      prepared.payment.status?.toString().trim() || "pending",
      prepared.payment.transactionId ?? null,
      prepared.payment.session ?? null,
      prepared.payment.cardNumber?.toString().trim() || "",
      syncMeta.posterIncomingOrderId?.trim() || "",
      syncMeta.posterTransactionId?.trim() || "",
      syncMeta.posterSyncStatus?.trim() || "",
      syncMeta.posterSyncError?.trim() || "",
      now,
      now
    );

    const orderId = Number(orderResult.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, title, price, quantity, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of prepared.normalizedItems) {
      insertItem.run(
        orderId,
        item.productId,
        item.title,
        item.price,
        item.quantity,
        item.total
      );
    }

    if (prepared.customerPhone) {
      db.prepare(`
        INSERT INTO customers (
          full_name, phone, email, notes, bonus_balance,
          total_spent, total_orders, is_active, created_at, updated_at
        )
        VALUES (?, ?, '', '', ?, ?, 1, 1, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
          full_name = CASE
            WHEN excluded.full_name != '' THEN excluded.full_name
            ELSE customers.full_name
          END,
          bonus_balance = customers.bonus_balance + excluded.bonus_balance,
          total_spent = customers.total_spent + excluded.total_spent,
          total_orders = customers.total_orders + 1,
          is_active = 1,
          updated_at = excluded.updated_at
      `).run(
        prepared.customerName,
        prepared.customerPhone,
        prepared.bonusEarned,
        prepared.total,
        now,
        now
      );
    }

    return orderId;
  });

  const orderId = transaction();

  return {
    id: orderId,
    externalId: prepared.externalId,
    customerPhone: prepared.customerPhone,
    status: "new",
    createdAt: now,
    subtotal: prepared.subtotal,
    deliveryFee: prepared.deliveryFee,
    total: prepared.total,
    bonusEarned: prepared.bonusEarned,
    addressText: prepared.addressText,
    posterIncomingOrderId: syncMeta.posterIncomingOrderId?.trim() || "",
    posterTransactionId: syncMeta.posterTransactionId?.trim() || "",
    posterSyncStatus: syncMeta.posterSyncStatus?.trim() || "",
    items: prepared.normalizedItems,
    payment: {
      method: prepared.payment.method?.toString().trim() || "cash",
      provider: prepared.payment.provider?.toString().trim() || "",
      status: prepared.payment.status?.toString().trim() || "pending",
      transactionId: prepared.payment.transactionId ?? null,
      session: prepared.payment.session ?? null,
      cardNumber: prepared.payment.cardNumber?.toString().trim() || "",
    },
  };
}
