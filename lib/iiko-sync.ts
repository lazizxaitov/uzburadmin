import "server-only";

import fs from "node:fs";
import path from "node:path";

import { getDb, nowIso } from "@/lib/db";
import {
  fetchIikoExternalMenu,
  fetchIikoExternalMenus,
} from "@/lib/iiko";
import { saveModifierGroups, type ModifierGroupInput } from "@/lib/product-modifiers";
import { slugify } from "@/lib/slug";
import { getDataDir } from "@/lib/storage";

type IikoSettingsRow = {
  base_url: string;
  app_id: string;
  client_secret: string;
  api_login: string;
  organization_id: string;
  import_categories: number;
  import_products: number;
  import_images: number;
  auto_sync_enabled: number;
  auto_sync_interval_minutes: number;
  menu_revision: number;
  last_sync_at: string | null;
};

// Ответ внешнего меню iiko бывает в разных версиях (v2: itemCategories/itemSizes/prices,
// v3: itemsGroups/sizePrices), поэтому все поля читаем терпимо.
type Raw = Record<string, unknown>;

type IikoGroup = {
  id?: string;
  name?: string;
  items?: Raw[];
};

type IikoProductMetadata = {
  id?: string;
  name?: string;
  orderItemType?: string;
};

type ParsedSize = {
  sizeId: string;
  sizeName: string;
  isDefault: boolean;
  price: number;
  images: string[];
  modifierGroups: unknown[];
};

let syncInFlight: Promise<IikoSyncResult> | null = null;

export type IikoSyncResult = {
  ok: true;
  importedCategories: number;
  importedProducts: number;
  importedModifierGroups: number;
};

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  // null / "" не должны превращаться в 0 (Number(null) === 0).
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Организация, для которой берём цены (в меню iiko цены бывают по организациям).
let priceOrganizationId = "";

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Цена в любом из форматов iiko: число, строка, объект
 * { currentPrice } / { price } / { value }, массив цен по организациям.
 */
function priceOf(value: unknown, depth = 0): number | null {
  if (depth > 4) return null;
  const direct = num(value);
  if (direct != null) return direct;
  if (Array.isArray(value)) {
    const entries = value.map(asRecord);
    const forOrg = entries.find((entry) => {
      const orgs = [
        text(entry.organizationId),
        ...asArray(entry.organizations).map((item) => text(item)),
        ...asArray(entry.organizationIds).map((item) => text(item)),
      ];
      return priceOrganizationId && orgs.includes(priceOrganizationId);
    });
    for (const entry of forOrg ? [forOrg, ...entries] : entries) {
      const price = priceOf(entry, depth + 1);
      if (price != null) return price;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Raw;
    if (record.isIncludedInMenu === false) return null;
    for (const key of ["currentPrice", "price", "value", "amount", "prices"]) {
      const price = priceOf(record[key], depth + 1);
      if (price != null) return price;
    }
  }
  return null;
}

function firstPrice(record: Raw) {
  for (const key of ["price", "prices", "sizePrices", "currentPrice"]) {
    const price = priceOf(record[key]);
    if (price != null) return price;
  }
  return null;
}

// Названия размеров, если меню отдаёт у товара только sizeId.
let sizeNameById = new Map<string, string>();

function getSettings() {
  return getDb().prepare("SELECT * FROM iiko_settings WHERE id = 1").get() as IikoSettingsRow;
}

function deactivateMissing(
  table: "categories" | "products",
  ids: string[],
  now: string,
) {
  const db = getDb();
  if (!ids.length) {
    db.prepare(`UPDATE ${table} SET is_active = 0, updated_at = ? WHERE synced_from_iiko = 1`).run(now);
    return;
  }
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(`
    UPDATE ${table}
    SET is_active = 0, updated_at = ?
    WHERE synced_from_iiko = 1 AND iiko_id NOT IN (${placeholders})
  `).run(now, ...ids);
}

function parseSizes(product: Raw): ParsedSize[] {
  const rawSizes = asArray(product.sizePrices).length
    ? asArray(product.sizePrices)
    : asArray(product.itemSizes);
  return rawSizes
    .map(asRecord)
    .filter((size) => size.isHidden !== true)
    .map((size) => ({
      sizeId: text(size.sizeId ?? size.id),
      sizeName: text(size.sizeName ?? size.name) || sizeNameById.get(text(size.sizeId ?? size.id)) || "",
      isDefault: size.isDefault === true,
      price: firstPrice(size),
      images: [text(size.buttonImageUrl), text(size.image), text(size.buttonImageCroppedUrl)].filter(Boolean),
      modifierGroups: [...asArray(size.itemModifierGroups), ...asArray(size.modifierGroups)],
    }))
    .filter((size): size is ParsedSize => size.price != null);
}

/** Превращает группы модификаторов iiko в формат нашей БД. */
function parseModifierGroups(
  rawGroups: unknown[],
  metadataById: Map<string, IikoProductMetadata>,
): ModifierGroupInput[] {
  const seen = new Set<string>();
  const result: ModifierGroupInput[] = [];
  for (const entry of rawGroups) {
    const group = asRecord(entry);
    const restrictions = asRecord(group.restrictions);
    const groupId = text(group.itemGroupId ?? group.id ?? group.modifierGroupId ?? group.productGroupId);
    const name = text(group.name) || text(metadataById.get(groupId)?.name);
    const key = groupId || name;
    if (!key || seen.has(key)) continue;

    const options = [...asArray(group.items), ...asArray(group.modifiers), ...asArray(group.childModifiers)]
      .map(asRecord)
      .filter((item) => item.isHidden !== true)
      .map((item) => {
        const itemRestrictions = asRecord(item.restrictions);
        const iikoId = text(item.itemId ?? item.productId ?? item.id ?? item.modifierId);
        const optionName = text(item.name) || text(metadataById.get(iikoId)?.name);
        const maxQty = num(itemRestrictions.maxQuantity ?? item.maxQuantity ?? item.maxAmount) ?? 1;
        const defaultQty = num(itemRestrictions.byDefault ?? item.byDefault ?? item.defaultAmount) ?? 0;
        return {
          iikoId,
          nameRu: optionName,
          nameUz: optionName,
          price: Math.max(0, Math.round(firstPrice(item) ?? 0)),
          maxQty: Math.max(1, Math.round(maxQty)),
          defaultQty: Math.max(0, Math.round(defaultQty)),
          isActive: true,
        };
      })
      .filter((item) => item.iikoId && item.nameRu);
    if (!options.length) continue;

    seen.add(key);
    const minQty = Math.max(0, Math.round(
      num(restrictions.minQuantity ?? group.minQuantity ?? group.minAmount) ?? 0,
    ));
    const rawMax = num(restrictions.maxQuantity ?? group.maxQuantity ?? group.maxAmount);
    const optionCapacity = options.reduce((sum, item) => sum + item.maxQty, 0);
    // 0 / отсутствие maxQuantity в iiko означает «без ограничения».
    const maxQty = rawMax && rawMax > 0 ? Math.round(rawMax) : optionCapacity;
    result.push({
      iikoGroupId: groupId,
      nameRu: name || "Модификаторы",
      nameUz: name || "Modifikatorlar",
      minQty,
      maxQty: Math.max(minQty, 1, maxQty),
      freeQty: Math.max(0, Math.round(num(restrictions.freeQuantity ?? group.freeQuantity) ?? 0)),
      options,
    });
  }
  return result;
}

function saveRawMenu(menu: unknown) {
  // Последний ответ iiko — для диагностики модификаторов. Ошибки записи не критичны.
  try {
    fs.writeFileSync(path.join(getDataDir(), "iiko-last-menu.json"), JSON.stringify(menu, null, 2));
  } catch {
    // ignore
  }
}

export async function runIikoSync(): Promise<IikoSyncResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const db = getDb();
    const settings = getSettings();
    if (!settings.app_id || !settings.client_secret || !settings.api_login || !settings.organization_id) {
      throw new Error("Укажите App ID, Client Secret, API Key и Organization ID iiko");
    }

    const now = nowIso();
    let importedCategories = 0;
    let importedProducts = 0;
    let importedModifierGroups = 0;

    try {
      const menuList = await fetchIikoExternalMenus(settings);
      const externalMenu = Array.isArray(menuList.externalMenus)
        ? menuList.externalMenus[0]
        : undefined;
      if (!externalMenu?.id) {
        throw new Error("В iiko не найдено внешнее меню");
      }

      const result = await fetchIikoExternalMenu(
        settings,
        settings.organization_id,
        externalMenu.id,
      );
      saveRawMenu(result);
      priceOrganizationId = settings.organization_id;
      sizeNameById = new Map();
      for (const key of ["sizes", "productSizes", "itemSizes"]) {
        for (const entry of asArray(result[key])) {
          const size = asRecord(entry);
          const id = text(size.id ?? size.sizeId);
          const name = text(size.name ?? size.sizeName);
          if (id && name) sizeNameById.set(id, name);
        }
      }
      const groups = (asArray(result.itemsGroups).length
        ? asArray(result.itemsGroups)
        : asArray(result.itemCategories)) as IikoGroup[];
      const productMetadata = asArray(result.products) as IikoProductMetadata[];
      const metadataById = new Map(
        productMetadata.map((item) => [text(item.id), item]),
      );
      // Схемы модификаторов (если меню ссылается на них по id).
      const schemaById = new Map<string, unknown[]>();
      for (const key of ["modifierSchemas", "modifierGroups", "itemModifierGroups"]) {
        for (const entry of asArray(result[key])) {
          const schema = asRecord(entry);
          const id = text(schema.id ?? schema.modifierSchemaId);
          if (!id) continue;
          schemaById.set(id, [...asArray(schema.itemModifierGroups), ...asArray(schema.modifierGroups), ...(
            asArray(schema.items).length && !asArray(schema.itemModifierGroups).length && !asArray(schema.modifierGroups).length
              ? [schema]
              : []
          )]);
        }
      }
      const menuItemCount = groups.reduce(
        (total, group) => total + (Array.isArray(group.items) ? group.items.length : 0),
        0,
      );
      if (!groups.length || !menuItemCount) {
        throw new Error(`Внешнее меню «${externalMenu.name || externalMenu.id}» пустое`);
      }

      if (settings.import_categories === 1) {
        const importedIds: string[] = [];
        const upsert = db.prepare(`
          INSERT INTO categories (
            iiko_id, name_ru, name_uz, slug, image_url, sort_order, is_active,
            synced_from_iiko, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(iiko_id) DO UPDATE SET
            name_ru = excluded.name_ru,
            name_uz = excluded.name_uz,
            image_url = excluded.image_url,
            sort_order = excluded.sort_order,
            is_active = excluded.is_active,
            synced_from_iiko = 1,
            updated_at = excluded.updated_at
        `);

        for (const [index, group] of groups.entries()) {
          const id = text(group.id);
          const name = text(group.name);
          if (!id || !name) continue;
          importedIds.push(id);
          upsert.run(
            id,
            name,
            name,
            `${slugify(name)}-${id.slice(0, 8)}`,
            null,
            index,
            1,
            now,
            now,
          );
          importedCategories += 1;
        }
        deactivateMissing("categories", importedIds, now);
      }

      if (settings.import_products === 1) {
        const importedIds: string[] = [];
        const findCategory = db.prepare("SELECT id FROM categories WHERE iiko_id = ?");
        const findProduct = db.prepare("SELECT id FROM products WHERE iiko_id = ?");
        const upsert = db.prepare(`
          INSERT INTO products (
            iiko_id, category_id, title_ru, title_uz, description_text_ru,
            description_text_uz, price, pricing_mode, stock, is_active,
            synced_from_iiko, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)
          ON CONFLICT(iiko_id) DO UPDATE SET
            category_id = excluded.category_id,
            title_ru = excluded.title_ru,
            title_uz = excluded.title_uz,
            description_text_ru = excluded.description_text_ru,
            description_text_uz = excluded.description_text_uz,
            price = excluded.price,
            pricing_mode = excluded.pricing_mode,
            is_active = excluded.is_active,
            synced_from_iiko = 1,
            updated_at = excluded.updated_at
        `);
        const clearImages = db.prepare("DELETE FROM product_images WHERE product_id = ?");
        const insertImage = db.prepare("INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)");
        const selectPortions = db.prepare(
          "SELECT id, label_ru, iiko_size_id FROM portion_options WHERE product_id = ?",
        );
        const updatePortion = db.prepare(
          "UPDATE portion_options SET label_ru = ?, label_uz = ?, price = ?, iiko_size_id = ? WHERE id = ?",
        );
        const deletePortion = db.prepare("DELETE FROM portion_options WHERE id = ?");
        const insertPortion = db.prepare(
          "INSERT INTO portion_options (product_id, label_ru, label_uz, price, iiko_size_id) VALUES (?, ?, ?, ?, ?)",
        );

        const seenProducts = new Set<string>();
        const importProducts = db.transaction(() => {
          for (const group of groups) {
            const categoryIikoId = text(group.id);
            const category = categoryIikoId
              ? findCategory.get(categoryIikoId) as { id: number } | undefined
              : undefined;

            for (const product of group.items ?? []) {
              const id = text(product.productId ?? product.itemId);
              const name = text(product.name);
              const metadata = metadataById.get(id);
              const orderItemType = text(metadata?.orderItemType ?? product.orderItemType).toLowerCase();
              if (!id || !name || seenProducts.has(id) || orderItemType === "modifier") continue;

              const availablePrices = parseSizes(product);
              if (!availablePrices.length) continue;

              seenProducts.add(id);
              const defaultSize = availablePrices.find((item) => item.isDefault)
                ?? availablePrices[0];
              const price = Math.round(defaultSize.price);
              const description = text(product.description);

              importedIds.push(id);
              upsert.run(
                id,
                category?.id ?? null,
                name,
                name,
                description,
                description,
                price,
                availablePrices.length > 1 ? "portion" : "quantity",
                product.isHidden === true ? 0 : 1,
                now,
                now,
              );

              const row = findProduct.get(id) as { id: number };
              if (settings.import_images === 1) {
                clearImages.run(row.id);
                const imageUrls = [...new Set([
                  ...availablePrices.flatMap((item) => item.images),
                  text(product.buttonImageUrl),
                ].filter(Boolean))];
                imageUrls.forEach((url, imageIndex) => {
                  insertImage.run(row.id, url, imageIndex);
                });
              }

              // Сохраняем ID порций (по iiko sizeId или названию), чтобы не ломать корзины.
              const existingPortions = selectPortions.all(row.id) as Array<{
                id: number;
                label_ru: string;
                iiko_size_id: string;
              }>;
              const keptPortionIds: number[] = [];
              if (availablePrices.length > 1) {
                availablePrices.forEach((item, portionIndex) => {
                  const label = item.sizeName || `Размер ${portionIndex + 1}`;
                  const match = existingPortions.find((portion) =>
                    !keptPortionIds.includes(portion.id) && (
                      (item.sizeId && portion.iiko_size_id === item.sizeId) ||
                      (!portion.iiko_size_id && portion.label_ru === label)
                    ));
                  if (match) {
                    updatePortion.run(label, label, Math.round(item.price), item.sizeId, match.id);
                    keptPortionIds.push(match.id);
                  } else {
                    keptPortionIds.push(Number(
                      insertPortion.run(row.id, label, label, Math.round(item.price), item.sizeId).lastInsertRowid,
                    ));
                  }
                });
              }
              for (const portion of existingPortions) {
                if (!keptPortionIds.includes(portion.id)) deletePortion.run(portion.id);
              }

              // Модификаторы: у размера по умолчанию, у самого товара или в схеме по id.
              const schemaId = text(product.modifierSchemaId);
              const modifierGroups = parseModifierGroups(
                [
                  ...defaultSize.modifierGroups,
                  ...asArray(product.itemModifierGroups),
                  ...asArray(product.modifierGroups),
                  ...(schemaId ? schemaById.get(schemaId) ?? [] : []),
                ],
                metadataById,
              );
              saveModifierGroups(row.id, modifierGroups, { fromSync: true });
              importedModifierGroups += modifierGroups.length;
              importedProducts += 1;
            }
          }
        });
        importProducts();
        deactivateMissing("products", importedIds, now);
      }

      db.prepare(`
        UPDATE iiko_settings
        SET is_connected = 1, menu_revision = ?, last_sync_at = ?,
            last_sync_status = ?, last_sync_error = '', updated_at = ?
        WHERE id = 1
      `).run(
        Number(result.revision ?? 0),
        now,
        `Imported ${importedCategories} categories, ${importedProducts} products, ${importedModifierGroups} modifier groups`,
        now,
      );

      return { ok: true, importedCategories, importedProducts, importedModifierGroups };
    } catch (error) {
      const message = error instanceof Error ? error.message : "iiko sync failed";
      db.prepare(`
        UPDATE iiko_settings
        SET is_connected = 0, last_sync_status = 'Sync failed',
            last_sync_error = ?, updated_at = ?
        WHERE id = 1
      `).run(message, nowIso());
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export async function maybeAutoSyncIiko() {
  const settings = getSettings();
  if (
    settings.auto_sync_enabled !== 1 ||
    !settings.app_id ||
    !settings.client_secret ||
    !settings.api_login ||
    !settings.organization_id
  ) return;
  const interval = Math.max(1, Number(settings.auto_sync_interval_minutes || 30));
  const lastSync = settings.last_sync_at ? Date.parse(settings.last_sync_at) : 0;
  if (lastSync && Date.now() - lastSync < interval * 60_000) return;
  try {
    await runIikoSync();
  } catch {
    // Public catalog requests must keep working if iiko is temporarily unavailable.
  }
}
