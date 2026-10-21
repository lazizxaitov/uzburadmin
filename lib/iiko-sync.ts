import "server-only";

import { getDb, nowIso } from "@/lib/db";
import { fetchIikoNomenclature } from "@/lib/iiko";
import { slugify } from "@/lib/slug";

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

type IikoGroup = {
  id?: string;
  name?: string;
  description?: string;
  imageLinks?: string[];
  order?: number;
  isIncludedInMenu?: boolean;
  isGroupModifier?: boolean;
  isDeleted?: boolean;
};

type IikoSizePrice = {
  sizeId?: string;
  price?: {
    currentPrice?: number;
    isIncludedInMenu?: boolean;
  };
};

type IikoProduct = {
  id?: string;
  name?: string;
  fullNameEnglish?: string;
  description?: string;
  parentGroup?: string;
  groupId?: string;
  type?: string;
  imageLinks?: string[];
  sizePrices?: IikoSizePrice[];
  isDeleted?: boolean;
};

type IikoSize = { id?: string; name?: string; isDefault?: boolean };

let syncInFlight: Promise<IikoSyncResult> | null = null;

export type IikoSyncResult = {
  ok: true;
  importedCategories: number;
  importedProducts: number;
};

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

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

    try {
      const result = await fetchIikoNomenclature(
        settings,
        settings.organization_id,
        0,
      );
      const groups = Array.isArray(result.groups) ? result.groups as IikoGroup[] : [];
      const products = Array.isArray(result.products) ? result.products as IikoProduct[] : [];
      const sizes = Array.isArray(result.sizes) ? result.sizes as IikoSize[] : [];
      const sizeById = new Map(sizes.map((item) => [text(item.id), item]));

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

        for (const group of groups) {
          const id = text(group.id);
          const name = text(group.name);
          if (!id || !name || group.isGroupModifier || group.isDeleted) continue;
          importedIds.push(id);
          upsert.run(
            id,
            name,
            name,
            `${slugify(name)}-${id.slice(0, 8)}`,
            settings.import_images === 1 ? text(group.imageLinks?.[0]) || null : null,
            Number(group.order ?? 0),
            group.isIncludedInMenu === false ? 0 : 1,
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
        const clearPortions = db.prepare("DELETE FROM portion_options WHERE product_id = ?");
        const insertPortion = db.prepare("INSERT INTO portion_options (product_id, label_ru, label_uz, price) VALUES (?, ?, ?, ?)");

        for (const product of products) {
          const id = text(product.id);
          const name = text(product.name);
          if (!id || !name || product.isDeleted || product.type === "modifier") continue;

          const availablePrices = (product.sizePrices ?? []).filter(
            (item) => item.price?.isIncludedInMenu !== false,
          );
          if (!availablePrices.length) continue;

          const parentId = text(product.parentGroup ?? product.groupId);
          const category = parentId
            ? findCategory.get(parentId) as { id: number } | undefined
            : undefined;
          const defaultPrice = availablePrices.find(
            (item) => sizeById.get(text(item.sizeId))?.isDefault,
          ) ?? availablePrices[0];
          const price = Math.round(Number(defaultPrice.price?.currentPrice ?? 0));
          const description = text(product.description);

          importedIds.push(id);
          upsert.run(
            id,
            category?.id ?? null,
            name,
            text(product.fullNameEnglish) || name,
            description,
            description,
            price,
            availablePrices.length > 1 ? "portion" : "quantity",
            1,
            now,
            now,
          );

          const row = findProduct.get(id) as { id: number };
          if (settings.import_images === 1) {
            clearImages.run(row.id);
            (product.imageLinks ?? []).filter(Boolean).forEach((url, index) => {
              insertImage.run(row.id, url, index);
            });
          }

          clearPortions.run(row.id);
          if (availablePrices.length > 1) {
            availablePrices.forEach((item) => {
              const label = text(sizeById.get(text(item.sizeId))?.name) || "Размер";
              insertPortion.run(
                row.id,
                label,
                label,
                Math.round(Number(item.price?.currentPrice ?? 0)),
              );
            });
          }
          importedProducts += 1;
        }
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
        `Imported ${importedCategories} categories and ${importedProducts} products`,
        now,
      );

      return { ok: true, importedCategories, importedProducts };
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
