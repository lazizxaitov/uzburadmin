import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const products = db
    .prepare(
      `SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC`
    )
    .all();

  const imageRows = db
    .prepare("SELECT * FROM product_images ORDER BY sort_order ASC")
    .all();
  const portionRows = db.prepare("SELECT * FROM portion_options").all();

  const imagesByProduct = new Map<number, string[]>();
  for (const row of imageRows as Array<{ product_id: number; url: string }>) {
    const list = imagesByProduct.get(row.product_id) ?? [];
    list.push(row.url);
    imagesByProduct.set(row.product_id, list);
  }

  const portionsByProduct = new Map<
    number,
    Array<{ id: number; label_ru: string; label_uz: string; price: number }>
  >();
  for (const row of portionRows as Array<{
    product_id: number;
    id: number;
    label_ru: string;
    label_uz: string;
    price: number;
  }>) {
    const list = portionsByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      label_ru: row.label_ru,
      label_uz: row.label_uz,
      price: row.price,
    });
    portionsByProduct.set(row.product_id, list);
  }

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

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const titleRu = body?.titleRu?.toString()?.trim();
  const titleUz = body?.titleUz?.toString()?.trim();
  const categoryId = body?.categoryId ? Number(body.categoryId) : null;
  const descriptionTitleRu = body?.descriptionTitleRu?.toString()?.trim() ?? null;
  const descriptionTitleUz = body?.descriptionTitleUz?.toString()?.trim() ?? null;
  const descriptionTextRu = body?.descriptionTextRu?.toString()?.trim() ?? null;
  const descriptionTextUz = body?.descriptionTextUz?.toString()?.trim() ?? null;
  const price = Number(body?.price ?? 0);
  const priceTextRu = body?.priceTextRu?.toString()?.trim() ?? null;
  const priceTextUz = body?.priceTextUz?.toString()?.trim() ?? null;
  const pricingMode = body?.pricingMode === "portion" ? "portion" : "quantity";
  const stock = Number(body?.stock ?? 0);
  const isActive = body?.isActive === false ? 0 : 1;
  const images = Array.isArray(body?.images) ? body.images : [];
  const portionOptions: Array<{
    labelRu?: string;
    labelUz?: string;
    price?: number;
  }> = Array.isArray(body?.portionOptions) ? body.portionOptions : [];

  if (!titleRu || !titleUz) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  if (pricingMode === "portion" && portionOptions.length === 0) {
    return NextResponse.json(
      { error: "Добавьте хотя бы один вариант порции" },
      { status: 400 }
    );
  }

  const db = getDb();
  if (categoryId) {
    const categoryExists = db
      .prepare("SELECT id FROM categories WHERE id = ?")
      .get(categoryId) as { id: number } | undefined;
    if (!categoryExists) {
      return NextResponse.json(
        { error: "Категория не найдена" },
        { status: 400 }
      );
    }
  }
  const now = nowIso();
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO products
         (category_id, title_ru, title_uz, description_title_ru, description_title_uz, description_text_ru, description_text_uz,
          price, price_text_ru, price_text_uz, pricing_mode, stock, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        categoryId,
        titleRu,
        titleUz,
        descriptionTitleRu,
        descriptionTitleUz,
        descriptionTextRu,
        descriptionTextUz,
        price,
        priceTextRu,
        priceTextUz,
        pricingMode,
        stock,
        isActive,
        now,
        now
      );

    const productId = Number(result.lastInsertRowid);

    const insertImage = db.prepare(
      "INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)"
    );
    images.forEach((url: string, index: number) => {
      if (typeof url === "string" && url.trim()) {
        insertImage.run(productId, url.trim(), index);
      }
    });

    const insertPortion = db.prepare(
      "INSERT INTO portion_options (product_id, label_ru, label_uz, price) VALUES (?, ?, ?, ?)"
    );
    portionOptions.forEach((option) => {
      const labelRu = option?.labelRu?.toString()?.trim();
      const labelUz = option?.labelUz?.toString()?.trim();
      const optPrice = Number(option?.price ?? 0);
      if (labelRu && labelUz) {
        insertPortion.run(productId, labelRu, labelUz, optPrice);
      }
    });

    return productId;
  });

  const productId = insert();
  return NextResponse.json({ id: productId });
}
