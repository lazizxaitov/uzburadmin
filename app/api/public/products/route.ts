import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { maybeAutoSyncPoster } from "@/lib/poster-sync";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

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
  const products = db
    .prepare(
      `SELECT p.* FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1 AND (p.category_id IS NULL OR c.is_active = 1)
       ORDER BY p.created_at DESC`
    )
    .all();

  const imageRows = db
    .prepare("SELECT product_id, url FROM product_images ORDER BY sort_order ASC")
    .all() as Array<{ product_id: number; url: string }>;
  const portionRows = db
    .prepare("SELECT product_id, id, label_ru, label_uz, price FROM portion_options")
    .all() as Array<{
    product_id: number;
    id: number;
    label_ru: string;
    label_uz: string;
    price: number;
  }>;

  const imagesByProduct = new Map<number, string[]>();
  imageRows.forEach((row) => {
    const list = imagesByProduct.get(row.product_id) ?? [];
    list.push(row.url);
    imagesByProduct.set(row.product_id, list);
  });

  const portionsByProduct = new Map<
    number,
    Array<{ id: number; label_ru: string; label_uz: string; price: number }>
  >();
  portionRows.forEach((row) => {
    const list = portionsByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      label_ru: row.label_ru,
      label_uz: row.label_uz,
      price: row.price,
    });
    portionsByProduct.set(row.product_id, list);
  });

  const enriched = (products as Array<Record<string, unknown>>).map((item) => {
    const id = Number(item.id);
    return {
      ...item,
      images: imagesByProduct.get(id) ?? [],
      portionOptions: portionsByProduct.get(id) ?? [],
    };
  });

  return NextResponse.json({ items: enriched });
}
