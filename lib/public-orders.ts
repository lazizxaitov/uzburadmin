import { getDb, nowIso } from "@/lib/db";
import { resolveBranchForAddress, type Branch } from "@/lib/branches";
import { validateDelivery } from "@/lib/delivery-validation";
import { loadModifierGroups, type OrderItemOptions } from "@/lib/product-modifiers";

export type OrderItemInput = {
  productId: number;
  quantity: number;
  portionId: number;
  modifiers: Array<{ id: number; quantity: number }>;
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
    options: OrderItemOptions | null;
  }>;
  /** Филиал, в который уходит заказ (null — филиалы не настроены). */
  branch: Branch | null;
  branchDistanceKm: number | null;
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
  iikoOrderId?: string;
  iikoCorrelationId?: string;
  iikoSyncStatus?: string;
  iikoSyncError?: string;
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
      const modifiers = (Array.isArray(record?.modifiers) ? record.modifiers : [])
        .map((entry: unknown) => {
          const modifier = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
          return { id: toPositiveInt(modifier.id), quantity: toPositiveInt(modifier.quantity ?? 1) };
        })
        .filter((modifier: { id: number; quantity: number }) => modifier.id && modifier.quantity);
      return { productId, quantity, portionId: toPositiveInt(record?.portionId), modifiers };
    })
    .filter((item: OrderItemInput | null): item is OrderItemInput => item !== null);

  if (!items.length) {
    return { ok: false, status: 400, error: "Добавьте товары в заказ" };
  }

  const db = getDb();
  const settings = db.prepare(`
    SELECT delivery_fee, min_order, bonus_enabled, bonus_percent, work_hours,
           delivery_zone_enabled, delivery_center_lat, delivery_center_lng, delivery_radius_km
    FROM settings
    WHERE id = 1
  `).get() as
    | {
        delivery_fee?: number;
        min_order?: number;
        bonus_enabled?: number;
        bonus_percent?: number;
        work_hours?: string;
        delivery_zone_enabled?: number;
        delivery_center_lat?: number;
        delivery_center_lng?: number;
        delivery_radius_km?: number;
      }
    | undefined;

  const deliveryValidation = validateDelivery(address, settings ?? {});
  if (!deliveryValidation.ok) {
    return { ok: false, status: 400, error: deliveryValidation.error };
  }

  const branchResolution = resolveBranchForAddress(address?.latitude, address?.longitude);
  if (!branchResolution.ok) {
    return { ok: false, status: 400, error: branchResolution.error };
  }

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

  const portionRows = db.prepare(`
    SELECT id, product_id, label_ru, price, iiko_size_id
    FROM portion_options
    WHERE product_id IN (${productIds.map(() => "?").join(",")})
  `).all(...productIds) as Array<{
    id: number;
    product_id: number;
    label_ru: string;
    price: number;
    iiko_size_id: string;
  }>;
  const modifierGroupsByProduct = loadModifierGroups(productIds, { onlyActive: true });

  const normalizedItems: PreparedOrder["normalizedItems"] = [];
  for (const item of items) {
    const product = productsById.get(item.productId)!;
    let price = Number(product.price ?? 0);
    const titleParts: string[] = [];
    const options: OrderItemOptions = { portion: null, modifiers: [] };

    // Порция (размер). Старые версии приложения не присылают portionId — тогда базовая цена.
    if (item.portionId) {
      const portion = portionRows.find(
        (row) => row.id === item.portionId && row.product_id === product.id,
      );
      if (!portion) {
        return { ok: false, status: 400, error: `Размер товара «${product.title_ru}» больше недоступен` };
      }
      price = Number(portion.price ?? 0);
      titleParts.push(portion.label_ru);
      options.portion = {
        id: portion.id,
        label: portion.label_ru,
        price: portion.price,
        iikoSizeId: portion.iiko_size_id ?? "",
      };
    }

    // Модификаторы: проверяем принадлежность товару и ограничения групп.
    const groups = modifierGroupsByProduct.get(product.id) ?? [];
    const selected = new Map<number, number>();
    for (const modifier of item.modifiers) {
      selected.set(modifier.id, (selected.get(modifier.id) ?? 0) + modifier.quantity);
    }
    const knownOptionIds = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
    for (const optionId of selected.keys()) {
      if (!knownOptionIds.has(optionId)) {
        return { ok: false, status: 400, error: `Опция товара «${product.title_ru}» больше недоступна, обновите корзину` };
      }
    }
    let modifiersPrice = 0;
    for (const group of groups) {
      const units: number[] = [];
      let groupQty = 0;
      for (const option of group.options) {
        const qty = selected.get(option.id) ?? 0;
        if (!qty) continue;
        if (qty > option.max_qty) {
          return { ok: false, status: 400, error: `Слишком много «${option.name_ru}»` };
        }
        groupQty += qty;
        for (let i = 0; i < qty; i += 1) units.push(option.price);
        options.modifiers.push({
          id: option.id,
          groupId: group.id,
          name: option.name_ru,
          price: option.price,
          quantity: qty,
          iikoId: option.iiko_id,
          iikoGroupId: group.iiko_group_id,
        });
        titleParts.push(qty > 1 ? `${option.name_ru} ×${qty}` : option.name_ru);
      }
      if (groupQty < group.min_qty) {
        return {
          ok: false,
          status: 400,
          error: `Для «${product.title_ru}» выберите: ${group.name_ru}`,
        };
      }
      if (groupQty > group.max_qty) {
        return { ok: false, status: 400, error: `«${group.name_ru}»: можно выбрать не больше ${group.max_qty}` };
      }
      // Бесплатное количество в группе — самые дешёвые единицы не оплачиваются.
      units.sort((a, b) => a - b);
      modifiersPrice += units.slice(Math.min(group.free_qty, units.length)).reduce((sum, value) => sum + value, 0);
    }
    options.basePrice = price;
    price += modifiersPrice;

    const hasOptions = Boolean(options.portion) || options.modifiers.length > 0;
    normalizedItems.push({
      productId: product.id,
      title: titleParts.length ? `${product.title_ru} (${titleParts.join(", ")})` : product.title_ru,
      price,
      quantity: item.quantity,
      total: price * item.quantity,
      options: hasOptions ? options : null,
    });
  }

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
  const bonusPercent = Number(settings?.bonus_enabled ?? 1) === 1
    ? Number(settings?.bonus_percent ?? 0)
    : 0;
  const bonusEarned = Math.round(total * (bonusPercent / 100));

  return {
    ok: true,
    value: {
      customerName,
      customerPhone,
      address,
      normalizedItems,
      branch: branchResolution.branch,
      branchDistanceKm: branchResolution.distanceKm,
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
        iiko_order_id, iiko_correlation_id, iiko_sync_status, iiko_sync_error,
        branch_id, branch_name, created_at, updated_at
      )
      VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, 'mobile', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      syncMeta.iikoOrderId?.trim() || "",
      syncMeta.iikoCorrelationId?.trim() || "",
      syncMeta.iikoSyncStatus?.trim() || "",
      syncMeta.iikoSyncError?.trim() || "",
      prepared.branch?.id ?? null,
      prepared.branch?.name ?? "",
      now,
      now
    );

    const orderId = Number(orderResult.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, title, price, quantity, total, options_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of prepared.normalizedItems) {
      insertItem.run(
        orderId,
        item.productId,
        item.title,
        item.price,
        item.quantity,
        item.total,
        item.options ? JSON.stringify(item.options) : ""
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
          total_spent = customers.total_spent + excluded.total_spent,
          total_orders = customers.total_orders + 1,
          is_active = 1,
          updated_at = excluded.updated_at
      `).run(
        prepared.customerName,
        prepared.customerPhone,
        0,
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
    branch: prepared.branch
      ? { id: prepared.branch.id, name: prepared.branch.name, address: prepared.branch.address }
      : null,
    posterIncomingOrderId: syncMeta.posterIncomingOrderId?.trim() || "",
    posterTransactionId: syncMeta.posterTransactionId?.trim() || "",
    posterSyncStatus: syncMeta.posterSyncStatus?.trim() || "",
    iikoOrderId: syncMeta.iikoOrderId?.trim() || "",
    iikoCorrelationId: syncMeta.iikoCorrelationId?.trim() || "",
    iikoSyncStatus: syncMeta.iikoSyncStatus?.trim() || "",
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
