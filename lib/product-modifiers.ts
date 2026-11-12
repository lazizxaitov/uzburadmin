import "server-only";

import { getDb } from "@/lib/db";

export type ModifierOption = {
  id: number;
  iiko_id: string;
  name_ru: string;
  name_uz: string;
  price: number;
  max_qty: number;
  default_qty: number;
  is_active: number;
  /** JSON { iikoSizeId: цена } — цена модификатора для конкретного размера товара. */
  size_prices: string;
};

export type ModifierGroup = {
  id: number;
  iiko_group_id: string;
  name_ru: string;
  name_uz: string;
  min_qty: number;
  max_qty: number;
  free_qty: number;
  options: ModifierOption[];
};

/** Входные данные группы (из админки или синхронизации iiko). */
export type ModifierGroupInput = {
  id?: number | null;
  iikoGroupId?: string;
  nameRu: string;
  nameUz: string;
  minQty: number;
  maxQty: number;
  freeQty?: number;
  options: Array<{
    id?: number | null;
    iikoId?: string;
    nameRu: string;
    nameUz: string;
    price: number;
    maxQty: number;
    defaultQty?: number;
    isActive?: boolean;
    sizePrices?: Record<string, number>;
  }>;
};

function int(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

/** Группы модификаторов для набора товаров (или всех, если ids не передан). */
export function loadModifierGroups(
  productIds?: number[],
  { onlyActive = false }: { onlyActive?: boolean } = {},
) {
  const db = getDb();
  if (productIds && productIds.length === 0) return new Map<number, ModifierGroup[]>();
  const where = productIds ? `WHERE g.product_id IN (${productIds.map(() => "?").join(",")})` : "";
  const groups = db.prepare(`
    SELECT g.* FROM modifier_groups g ${where}
    ORDER BY g.product_id, g.sort_order, g.id
  `).all(...(productIds ?? [])) as Array<Omit<ModifierGroup, "options"> & { product_id: number }>;
  if (!groups.length) return new Map<number, ModifierGroup[]>();

  const groupIds = groups.map((item) => item.id);
  const options = db.prepare(`
    SELECT * FROM modifier_options
    WHERE group_id IN (${groupIds.map(() => "?").join(",")})
    ${onlyActive ? "AND is_active = 1" : ""}
    ORDER BY sort_order, id
  `).all(...groupIds) as Array<ModifierOption & { group_id: number }>;

  const optionsByGroup = new Map<number, ModifierOption[]>();
  for (const { group_id, ...option } of options) {
    const list = optionsByGroup.get(group_id) ?? [];
    list.push(option);
    optionsByGroup.set(group_id, list);
  }

  const result = new Map<number, ModifierGroup[]>();
  for (const { product_id, ...group } of groups) {
    const groupOptions = optionsByGroup.get(group.id) ?? [];
    if (onlyActive && !groupOptions.length) continue;
    const list = result.get(product_id) ?? [];
    list.push({ ...group, options: groupOptions });
    result.set(product_id, list);
  }
  return result;
}

/** Разбирает группы из тела запроса админки. */
export function parseModifierGroupsInput(raw: unknown): ModifierGroupInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group): ModifierGroupInput | null => {
      const record = group && typeof group === "object" ? group as Record<string, unknown> : {};
      const nameRu = str(record.nameRu);
      const nameUz = str(record.nameUz) || nameRu;
      if (!nameRu) return null;
      const options = (Array.isArray(record.options) ? record.options : [])
        .map((option) => {
          const item = option && typeof option === "object" ? option as Record<string, unknown> : {};
          const optionNameRu = str(item.nameRu);
          if (!optionNameRu) return null;
          return {
            id: int(item.id) || null,
            iikoId: str(item.iikoId),
            nameRu: optionNameRu,
            nameUz: str(item.nameUz) || optionNameRu,
            price: Math.max(0, int(item.price)),
            maxQty: Math.max(1, int(item.maxQty, 1)),
            defaultQty: Math.max(0, int(item.defaultQty)),
            isActive: item.isActive !== false,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const minQty = Math.max(0, int(record.minQty));
      const maxQty = Math.max(minQty, 1, int(record.maxQty, 1));
      return {
        id: int(record.id) || null,
        iikoGroupId: str(record.iikoGroupId),
        nameRu,
        nameUz,
        minQty,
        maxQty,
        freeQty: Math.max(0, int(record.freeQty)),
        options,
      };
    })
    .filter((item): item is ModifierGroupInput => item !== null);
}

/**
 * Сохраняет группы товара, сохраняя ID существующих записей (по id или iiko-id),
 * чтобы корзины в приложении не ломались после правок. Вызывать внутри транзакции.
 */
export function saveModifierGroups(
  productId: number,
  groups: ModifierGroupInput[],
  { fromSync = false }: { fromSync?: boolean } = {},
) {
  const db = getDb();
  // При синхронизации с iiko не трогаем ручные правки: скрытые опции и свои узбекские названия.
  const nameUzSql = fromSync
    ? "name_uz = CASE WHEN name_uz = '' OR name_uz = name_ru THEN ? ELSE name_uz END"
    : "name_uz = ?";
  const existingGroups = db.prepare(
    "SELECT id, iiko_group_id FROM modifier_groups WHERE product_id = ?",
  ).all(productId) as Array<{ id: number; iiko_group_id: string }>;
  const groupById = new Set(existingGroups.map((item) => item.id));
  const groupByIiko = new Map(
    existingGroups.filter((item) => item.iiko_group_id).map((item) => [item.iiko_group_id, item.id]),
  );

  const insertGroup = db.prepare(`
    INSERT INTO modifier_groups (product_id, iiko_group_id, name_ru, name_uz, min_qty, max_qty, free_qty, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateGroup = db.prepare(`
    UPDATE modifier_groups
    SET iiko_group_id = ?, name_ru = ?, ${nameUzSql}, min_qty = ?, max_qty = ?, free_qty = ?, sort_order = ?
    WHERE id = ?
  `);
  const selectOptions = db.prepare("SELECT id, iiko_id FROM modifier_options WHERE group_id = ?");
  const insertOption = db.prepare(`
    INSERT INTO modifier_options (group_id, iiko_id, name_ru, name_uz, price, max_qty, default_qty, is_active, sort_order, size_prices)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateOption = db.prepare(`
    UPDATE modifier_options
    SET iiko_id = ?, name_ru = ?, ${nameUzSql}, price = ?, max_qty = ?, default_qty = ?,
        is_active = ${fromSync ? "is_active + 0 * ?" : "?"}, sort_order = ?,
        size_prices = ${fromSync ? "?" : "CASE WHEN ? IS NULL THEN size_prices ELSE size_prices END"}
    WHERE id = ?
  `);

  const keptGroupIds: number[] = [];
  groups.forEach((group, groupIndex) => {
    const iikoGroupId = group.iikoGroupId ?? "";
    let groupId =
      (group.id && groupById.has(group.id) ? group.id : 0) ||
      (iikoGroupId ? groupByIiko.get(iikoGroupId) ?? 0 : 0);
    if (groupId && keptGroupIds.includes(groupId)) groupId = 0;
    const values = [
      iikoGroupId,
      group.nameRu,
      group.nameUz,
      group.minQty,
      group.maxQty,
      group.freeQty ?? 0,
      groupIndex,
    ] as const;
    if (groupId) {
      updateGroup.run(...values, groupId);
    } else {
      groupId = Number(insertGroup.run(productId, ...values).lastInsertRowid);
    }
    keptGroupIds.push(groupId);

    const existingOptions = selectOptions.all(groupId) as Array<{ id: number; iiko_id: string }>;
    const optionById = new Set(existingOptions.map((item) => item.id));
    const optionByIiko = new Map(
      existingOptions.filter((item) => item.iiko_id).map((item) => [item.iiko_id, item.id]),
    );
    const keptOptionIds: number[] = [];
    group.options.forEach((option, optionIndex) => {
      const iikoId = option.iikoId ?? "";
      let optionId =
        (option.id && optionById.has(option.id) ? option.id : 0) ||
        (iikoId ? optionByIiko.get(iikoId) ?? 0 : 0);
      if (optionId && keptOptionIds.includes(optionId)) optionId = 0;
      const optionValues = [
        iikoId,
        option.nameRu,
        option.nameUz,
        option.price,
        option.maxQty,
        option.defaultQty ?? 0,
        option.isActive === false ? 0 : 1,
        optionIndex,
        // Цены по размерам приходят только из iiko; ручное сохранение их не трогает.
        option.sizePrices && Object.keys(option.sizePrices).length ? JSON.stringify(option.sizePrices) : "",
      ] as const;
      if (optionId) {
        updateOption.run(...optionValues, optionId);
      } else {
        optionId = Number(insertOption.run(groupId, ...optionValues).lastInsertRowid);
      }
      keptOptionIds.push(optionId);
    });
    db.prepare(`
      DELETE FROM modifier_options WHERE group_id = ?
      ${keptOptionIds.length ? `AND id NOT IN (${keptOptionIds.map(() => "?").join(",")})` : ""}
    `).run(groupId, ...keptOptionIds);
  });

  db.prepare(`
    DELETE FROM modifier_groups WHERE product_id = ?
    ${keptGroupIds.length ? `AND id NOT IN (${keptGroupIds.map(() => "?").join(",")})` : ""}
  `).run(productId, ...keptGroupIds);
}

/**
 * Сохраняет порции товара, сохраняя ID и iiko_size_id существующих.
 * Вызывать внутри транзакции.
 */
export function savePortionOptions(productId: number, raw: unknown) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM portion_options WHERE product_id = ?").all(productId) as Array<{ id: number }>;
  const existingIds = new Set(existing.map((item) => item.id));
  const insert = db.prepare(
    "INSERT INTO portion_options (product_id, label_ru, label_uz, price) VALUES (?, ?, ?, ?)",
  );
  const update = db.prepare("UPDATE portion_options SET label_ru = ?, label_uz = ?, price = ? WHERE id = ?");
  const kept: number[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const labelRu = str(record.labelRu);
    const labelUz = str(record.labelUz);
    if (!labelRu || !labelUz) continue;
    const price = int(record.price);
    const id = int(record.id);
    if (id && existingIds.has(id) && !kept.includes(id)) {
      update.run(labelRu, labelUz, price, id);
      kept.push(id);
    } else {
      kept.push(Number(insert.run(productId, labelRu, labelUz, price).lastInsertRowid));
    }
  }
  db.prepare(`
    DELETE FROM portion_options WHERE product_id = ?
    ${kept.length ? `AND id NOT IN (${kept.map(() => "?").join(",")})` : ""}
  `).run(productId, ...kept);
}

/** Выбранные покупателем опции позиции заказа (то, что хранится в order_items.options_json). */
export type OrderItemOptions = {
  /** Цена товара (с учётом размера) без модификаторов. */
  basePrice?: number;
  portion?: { id: number; label: string; price: number; iikoSizeId: string } | null;
  modifiers: Array<{
    id: number;
    groupId: number;
    name: string;
    price: number;
    quantity: number;
    iikoId: string;
    iikoGroupId: string;
  }>;
};

/** Цена модификатора для размера товара (iiko sizeId); без размера — базовая цена опции. */
export function modifierPriceForSize(option: Pick<ModifierOption, "price" | "size_prices">, iikoSizeId?: string | null) {
  if (!option.size_prices) return option.price;
  try {
    const map = JSON.parse(option.size_prices) as Record<string, number>;
    if (iikoSizeId && typeof map[iikoSizeId] === "number") return map[iikoSizeId];
  } catch {
    // повреждённый JSON — используем базовую цену
  }
  return option.price;
}
