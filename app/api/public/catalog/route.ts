import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { maybeAutoSyncPoster } from "@/lib/poster-sync";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import { resolvePublicUrl } from "@/lib/public-url";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }
  await maybeAutoSyncPoster();

  const db = getDb();
  const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get() as
    | Record<string, unknown>
    | undefined;
  const banners = db
    .prepare("SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC")
    .all() as Array<Record<string, unknown>>;
  const categories = db.prepare(
    "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC"
  ).all() as Array<Record<string, unknown>>;
  const products = db.prepare(
    `
      SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND (p.category_id IS NULL OR c.is_active = 1)
      ORDER BY p.created_at DESC
    `
  ).all() as Array<Record<string, unknown>>;
  const images = db.prepare("SELECT product_id, url FROM product_images ORDER BY sort_order ASC").all() as Array<{ product_id: number; url: string }>;
  const portionRows = db
    .prepare("SELECT product_id, id, label_ru, label_uz, price FROM portion_options ORDER BY id ASC")
    .all() as Array<{
    product_id: number;
    id: number;
    label_ru: string;
    label_uz: string;
    price: number;
  }>;

  const imagesByProduct = new Map<number, string[]>();
  for (const row of images) {
    const list = imagesByProduct.get(row.product_id) ?? [];
    list.push(row.url);
    imagesByProduct.set(row.product_id, list);
  }

  const portionsByProduct = new Map<
    number,
    Array<{ id: number; label_ru: string; label_uz: string; price: number }>
  >();
  for (const row of portionRows) {
    const list = portionsByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      label_ru: row.label_ru,
      label_uz: row.label_uz,
      price: row.price,
    });
    portionsByProduct.set(row.product_id, list);
  }

  const enrichedProducts = products.map((item) => ({
    ...item,
    images: imagesByProduct.get(Number(item.id)) ?? [],
    portionOptions: portionsByProduct.get(Number(item.id)) ?? [],
  }));

  const resolvedSettings = settings
    ? {
        ...settings,
        splash_image_url: await resolvePublicUrl(
          typeof settings.splash_image_url === "string" ? settings.splash_image_url : "",
        ),
        payme_qr_image_url: await resolvePublicUrl(
          typeof settings.payme_qr_image_url === "string" ? settings.payme_qr_image_url : "",
        ),
        click_qr_image_url: await resolvePublicUrl(
          typeof settings.click_qr_image_url === "string" ? settings.click_qr_image_url : "",
        ),
      }
    : settings;

  const resolvedBanners = await Promise.all(
    banners.map(async (item) => ({
      ...item,
      image_url: await resolvePublicUrl(
        typeof item.image_url === "string" ? item.image_url : "",
      ),
    })),
  );

  const resolvedCategories = await Promise.all(
    categories.map(async (item) => ({
      ...item,
      image_url: await resolvePublicUrl(
        typeof item.image_url === "string" ? item.image_url : "",
      ),
    })),
  );

  const resolvedProducts = await Promise.all(
    enrichedProducts.map(async (item) => ({
      ...item,
      images: await Promise.all(
        ((item.images as string[] | undefined) ?? []).map((url) => resolvePublicUrl(url)),
      ),
    })),
  );

  return NextResponse.json({
    settings: resolvedSettings,
    banners: resolvedBanners,
    categories: resolvedCategories,
    products: resolvedProducts,
  });
}
