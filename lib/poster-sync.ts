import "server-only";

import { fetchPosterCategories, fetchPosterProducts } from "@/lib/poster";
import { getDb, nowIso } from "@/lib/db";
import { slugify } from "@/lib/slug";

type PosterSettingsRow = {
  account_name: string;
  access_token: string;
  username: string;
  password: string;
  use_token: number;
  import_categories: number;
  import_products: number;
  import_images: number;
  auto_sync_enabled?: number;
  auto_sync_interval_minutes?: number;
  last_sync_at?: string | null;
  webhook_secret?: string;
};

type PortionOption = {
  labelRu: string;
  labelUz: string;
  price: number;
};

let syncInFlight: Promise<PosterSyncResult> | null = null;

export type PosterSyncResult = {
  ok: true;
  importedCategories: number;
  importedProducts: number;
};

function toText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "string") {
    const normalized = value
      .replace(/\s+/g, "")
      .replace(",", ".")
      .trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPosterSettings() {
  return getDb()
    .prepare("SELECT * FROM poster_settings WHERE id = 1")
    .get() as PosterSettingsRow;
}

function pickLocalized(
  raw: Record<string, unknown>,
  keys: string[],
  lang: "ru" | "uz",
) {
  const suffixes = lang === "ru"
    ? ["_ru", "_rus", "_russian", "Ru", "RU"]
    : ["_uz", "_uzb", "_uzbek", "Uz", "UZ"];

  for (const key of keys) {
    for (const suffix of suffixes) {
      const value = raw[`${key}${suffix}`];
      const text = toText(value);
      if (text) return text;
    }
  }

  if (lang === "uz") {
    for (const key of keys) {
      const value = raw[`${key}_lat`] ?? raw[`${key}_latin`];
      const text = toText(value);
      if (text) return text;
    }
  }

  for (const key of keys) {
    const text = toText(raw[key]);
    if (text) return text;
  }

  return "";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractUrls(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return [trimmed];
    }
    if (trimmed.startsWith("//")) {
      return [`https:${trimmed}`];
    }
    if (trimmed.startsWith("/")) {
      return [`https://joinposter.com${trimmed}`];
    }
    if (trimmed.includes("joinposter.com/")) {
      return [`https://${trimmed.replace(/^https?:\/\//, "")}`];
    }
    return [];
  }

  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((item) => extractUrls(item)));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return uniqueStrings(
      Object.entries(record).flatMap(([key, nested]) => {
        if (
          key.toLowerCase().includes("photo") ||
          key.toLowerCase().includes("image") ||
          key.toLowerCase().includes("url")
        ) {
          return extractUrls(nested);
        }
        return [];
      }),
    );
  }

  return [];
}

function extractProductImages(raw: Record<string, unknown>) {
  const directKeys = [
    "photo_origin",
    "photo",
    "photo_big",
    "photo_src",
    "photo_path",
    "image",
    "image_url",
    "photo_url",
    "picture",
    "picture_url",
    "photos",
    "images",
    "gallery",
  ];

  return uniqueStrings(
    [
      ...directKeys.flatMap((key) => extractUrls(raw[key])),
      ...extractUrls(raw),
    ],
  );
}

function firstValidNumber(values: unknown[], fallback = 0) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstValidNumber(value, Number.NaN);
      if (Number.isFinite(nested)) return nested;
      continue;
    }

    if (value && typeof value === "object") {
      const nested = firstValidNumber(Object.values(value as Record<string, unknown>), Number.NaN);
      if (Number.isFinite(nested)) return nested;
      continue;
    }

    const parsed = toNumber(value, Number.NaN);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function extractProductPrice(raw: Record<string, unknown>) {
  return firstValidNumber(
    [
      raw.price1,
      raw.price,
      raw.cost,
      raw.menu_price,
      raw.product_price,
      raw.base_price,
      raw.spots,
      raw.spot_prices,
      raw.prices,
      raw.price_list,
      raw.variation_prices,
      raw.modifications,
      raw.portions,
      raw.sizes,
    ],
    0,
  );
}

function normalizePortionOption(raw: Record<string, unknown>): PortionOption | null {
  const labelRu = pickLocalized(raw, ["label", "name", "title", "modification_name", "group_name", "spot_name", "portion_name", "size_name"], "ru");
  const labelUz = pickLocalized(raw, ["label", "name", "title", "modification_name", "group_name", "spot_name", "portion_name", "size_name"], "uz") || labelRu;
  if (!labelRu && !labelUz) return null;

  const price = toNumber(
    raw.price ??
      raw.price1 ??
      raw.extra_price ??
      raw.modification_price ??
      raw.spot_price ??
      raw.cost,
    0,
  );

  return {
    labelRu: labelRu || labelUz,
    labelUz: labelUz || labelRu,
    price,
  };
}

function extractPortionOptions(raw: Record<string, unknown>) {
  const optionArrays = [
    raw.portion_options,
    raw.portions,
    raw.sizes,
    raw.variants,
    raw.modifications,
    raw.modifiers,
    raw.menu_modifications,
    raw.group_modifications,
    raw.spots,
  ];

  const options: PortionOption[] = [];
  for (const candidate of optionArrays) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (!item || typeof item !== "object") continue;
      const normalized = normalizePortionOption(item as Record<string, unknown>);
      if (normalized) {
        options.push(normalized);
      }
    }
  }

  const seen = new Set<string>();
  return options.filter((item) => {
    const key = `${item.labelRu}|${item.labelUz}|${item.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deactivateMissingPosterRows(
  table: "categories" | "products",
  activePosterIds: string[],
  now: string,
) {
  const db = getDb();
  if (activePosterIds.length === 0) {
    db.prepare(
      `UPDATE ${table} SET is_active = 0, updated_at = ? WHERE synced_from_poster = 1`
    ).run(now);
    return;
  }

  const placeholders = activePosterIds.map(() => "?").join(", ");
  db.prepare(
    `UPDATE ${table}
     SET is_active = 0, updated_at = ?
     WHERE synced_from_poster = 1 AND poster_id NOT IN (${placeholders})`
  ).run(now, ...activePosterIds);
}

export async function runPosterSync(): Promise<PosterSyncResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const db = getDb();
    const poster = getPosterSettings();

    if (!poster.account_name || !poster.access_token) {
      throw new Error("Poster account and token are required");
    }

    const now = nowIso();
    let importedCategories = 0;
    let importedProducts = 0;

    try {
      if (poster.import_categories === 1) {
        const categories = (await fetchPosterCategories(poster)) ?? [];
        const importedPosterIds: string[] = [];

        const upsertCategory = db.prepare(`
          INSERT INTO categories (
            poster_id, name_ru, name_uz, slug, image_url, sort_order, is_active, synced_from_poster, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(poster_id) DO UPDATE SET
            name_ru = excluded.name_ru,
            name_uz = excluded.name_uz,
            slug = excluded.slug,
            image_url = COALESCE(NULLIF(excluded.image_url, ''), categories.image_url),
            sort_order = excluded.sort_order,
            is_active = excluded.is_active,
            synced_from_poster = 1,
            updated_at = excluded.updated_at
        `);

        for (const item of categories) {
          const raw = item as Record<string, unknown>;
          const posterId = toText(raw.category_id ?? raw.id);
          if (!posterId) continue;

          const nameRu =
            pickLocalized(raw, ["category_name", "name", "title"], "ru") ||
            pickLocalized(raw, ["product_name"], "ru");
          const nameUz =
            pickLocalized(raw, ["category_name", "name", "title"], "uz") ||
            nameRu;
          if (!nameRu && !nameUz) continue;

          importedPosterIds.push(posterId);
          upsertCategory.run(
            posterId,
            nameRu || nameUz,
            nameUz || nameRu,
            `${slugify(nameRu || nameUz)}-${posterId}`,
            extractProductImages(raw)[0] || null,
            toNumber(raw.sort_order ?? raw.sortOrder ?? raw.pos, 0),
            toNumber(raw.category_hidden ?? raw.hidden, 0) === 1 ? 0 : 1,
            now,
            now,
          );
          importedCategories += 1;
        }

        deactivateMissingPosterRows("categories", importedPosterIds, now);
      }

      if (poster.import_products === 1) {
        const products = (await fetchPosterProducts(poster)) ?? [];
        const importedPosterIds: string[] = [];

        const findCategory = db.prepare("SELECT id FROM categories WHERE poster_id = ?");
        const upsertProduct = db.prepare(`
          INSERT INTO products (
            poster_id, category_id, title_ru, title_uz, description_title_ru, description_title_uz,
            description_text_ru, description_text_uz, price, price_text_ru, price_text_uz,
            pricing_mode, stock, is_active, synced_from_poster, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(poster_id) DO UPDATE SET
            category_id = excluded.category_id,
            title_ru = excluded.title_ru,
            title_uz = excluded.title_uz,
            description_title_ru = excluded.description_title_ru,
            description_title_uz = excluded.description_title_uz,
            description_text_ru = excluded.description_text_ru,
            description_text_uz = excluded.description_text_uz,
            price = excluded.price,
            price_text_ru = excluded.price_text_ru,
            price_text_uz = excluded.price_text_uz,
            pricing_mode = excluded.pricing_mode,
            stock = excluded.stock,
            is_active = excluded.is_active,
            synced_from_poster = 1,
            updated_at = excluded.updated_at
        `);
        const clearImages = db.prepare("DELETE FROM product_images WHERE product_id = ?");
        const insertImage = db.prepare(
          "INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)"
        );
        const clearPortions = db.prepare("DELETE FROM portion_options WHERE product_id = ?");
        const insertPortion = db.prepare(
          "INSERT INTO portion_options (product_id, label_ru, label_uz, price) VALUES (?, ?, ?, ?)"
        );
        const findProduct = db.prepare("SELECT id FROM products WHERE poster_id = ?");

        for (const item of products) {
          const raw = item as Record<string, unknown>;
          const posterId = toText(raw.product_id ?? raw.id);
          if (!posterId) continue;

          const titleRu = pickLocalized(raw, ["product_name", "name", "title"], "ru");
          const titleUz = pickLocalized(raw, ["product_name", "name", "title"], "uz") || titleRu;
          if (!titleRu && !titleUz) continue;

          importedPosterIds.push(posterId);

          const categoryPosterId = toText(raw.menu_category_id ?? raw.category_id);
          const categoryRow = categoryPosterId
            ? (findCategory.get(categoryPosterId) as { id: number } | undefined)
            : undefined;
          const descriptionRu = pickLocalized(
            raw,
            ["product_production_description", "description", "description_text"],
            "ru",
          );
          const descriptionUz = pickLocalized(
            raw,
            ["product_production_description", "description", "description_text"],
            "uz",
          ) || descriptionRu;
          const portionOptions = extractPortionOptions(raw);
          const pricingMode = portionOptions.length > 0 ? "portion" : "quantity";

          upsertProduct.run(
            posterId,
            categoryRow?.id ?? null,
            titleRu || titleUz,
            titleUz || titleRu,
            null,
            null,
            descriptionRu,
            descriptionUz,
            extractProductPrice(raw),
            null,
            null,
            pricingMode,
            toNumber(raw.out ?? raw.stock ?? 0),
            toNumber(raw.hidden ?? raw.product_hidden, 0) === 1 ? 0 : 1,
            now,
            now,
          );

          const productRow = findProduct.get(posterId) as { id: number };
          if (poster.import_images === 1) {
            clearImages.run(productRow.id);
            extractProductImages(raw).forEach((url, index) => {
              insertImage.run(productRow.id, url, index);
            });
          }

          clearPortions.run(productRow.id);
          portionOptions.forEach((option) => {
            insertPortion.run(
              productRow.id,
              option.labelRu,
              option.labelUz,
              option.price,
            );
          });

          importedProducts += 1;
        }

        deactivateMissingPosterRows("products", importedPosterIds, now);
      }

      db.prepare(`
        UPDATE poster_settings
        SET is_connected = 1, last_sync_at = ?, last_sync_status = ?, last_sync_error = '', updated_at = ?
        WHERE id = 1
      `).run(
        now,
        `Imported ${importedCategories} categories and ${importedProducts} products`,
        now,
      );

      return {
        ok: true,
        importedCategories,
        importedProducts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Poster sync failed";
      db.prepare(`
        UPDATE poster_settings
        SET is_connected = 0, last_sync_status = 'Sync failed', last_sync_error = ?, updated_at = ?
        WHERE id = 1
      `).run(message, nowIso());
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export async function maybeAutoSyncPoster() {
  const poster = getPosterSettings();
  if (poster.auto_sync_enabled !== 1) return;
  if (!poster.account_name || !poster.access_token) return;

  const intervalMinutes = Math.max(1, Number(poster.auto_sync_interval_minutes ?? 30));
  const lastSyncAt = poster.last_sync_at ? Date.parse(poster.last_sync_at) : 0;
  const now = Date.now();
  if (lastSyncAt && now - lastSyncAt < intervalMinutes * 60 * 1000) {
    return;
  }

  try {
    await runPosterSync();
  } catch {
    // ignore in public request path
  }
}
