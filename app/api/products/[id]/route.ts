import { NextRequest, NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  loadModifierGroups,
  parseModifierGroupsInput,
  saveModifierGroups,
  savePortionOptions,
} from "@/lib/product-modifiers";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const product = db
    .prepare(
      `SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`
    )
    .get(id);

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const imageRows = db
    .prepare(
      "SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC"
    )
    .all(id) as Array<{ url: string }>;
  const images = imageRows.map((row) => row.url);

  const portionOptions = db
    .prepare(
      "SELECT id, label_ru, label_uz, price FROM portion_options WHERE product_id = ? ORDER BY id"
    )
    .all(id) as Array<{
    id: number;
    label_ru: string;
    label_uz: string;
    price: number;
  }>;

  const modifierGroups = loadModifierGroups([id]).get(id) ?? [];

  return NextResponse.json({ ...product, images, portionOptions, modifierGroups });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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
  const isPopular = body?.isPopular === true ? 1 : 0;
  const images = Array.isArray(body?.images) ? body.images : [];
  const portionOptions: unknown[] = Array.isArray(body?.portionOptions) ? body.portionOptions : [];
  const modifierGroups = parseModifierGroupsInput(body?.modifierGroups);

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
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE products
       SET category_id = ?, title_ru = ?, title_uz = ?, description_title_ru = ?, description_title_uz = ?,
           description_text_ru = ?, description_text_uz = ?, price = ?, price_text_ru = ?, price_text_uz = ?,
           pricing_mode = ?, stock = ?, is_active = ?, is_popular = ?, updated_at = ?
       WHERE id = ?`
    ).run(
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
      isPopular,
      now,
      id
    );

    db.prepare("DELETE FROM product_images WHERE product_id = ?").run(id);
    const insertImage = db.prepare(
      "INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)"
    );
    images.forEach((url: string, index: number) => {
      if (typeof url === "string" && url.trim()) {
        insertImage.run(id, url.trim(), index);
      }
    });

    savePortionOptions(id, portionOptions);
    saveModifierGroups(id, modifierGroups);
  });

  update();
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.isPopular !== "boolean") {
    return NextResponse.json({ error: "Invalid isPopular" }, { status: 400 });
  }

  const result = getDb().prepare(`
    UPDATE products
    SET is_popular = ?, updated_at = ?
    WHERE id = ?
  `).run(body.isPopular ? 1 : 0, nowIso(), id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, isPopular: body.isPopular });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
