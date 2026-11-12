import { NextRequest, NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

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
  const imageUrl = body?.imageUrl?.toString()?.trim();
  const bannerType = ["product", "category", "products"].includes(body?.bannerType) ? body.bannerType : "image";
  const useTargetImage = body?.useTargetImage === true ? 1 : 0;
  const targetProductId = body?.targetProductId ? Number(body.targetProductId) : null;
  const targetCategoryId = body?.targetCategoryId ? Number(body.targetCategoryId) : null;
  // Акция на несколько товаров: id через запятую в порядке показа.
  const targetProductIds = (Array.isArray(body?.targetProductIds) ? body.targetProductIds : [])
    .map((value: unknown) => Math.round(Number(value)))
    .filter((value: number, index: number, list: number[]) => value > 0 && list.indexOf(value) === index);
  const linkUrl = body?.linkUrl?.toString()?.trim() ?? null;
  const sortOrder = Number(body?.sortOrder ?? 0);
  const isActive = body?.isActive === false ? 0 : 1;
  const requiresUploadedImage = !(bannerType !== "image" && useTargetImage === 1);

  if (!titleRu || !titleUz || (requiresUploadedImage && !imageUrl)) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  if (bannerType === "products" && targetProductIds.length === 0) {
    return NextResponse.json({ error: "Выберите товары акции" }, { status: 400 });
  }

  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE banners
     SET title_ru = ?, title_uz = ?, image_url = ?, banner_type = ?, use_target_image = ?, target_product_id = ?, target_category_id = ?, target_product_ids = ?, link_url = ?, sort_order = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    titleRu,
    titleUz,
    imageUrl ?? "",
    bannerType,
    bannerType === "image" ? 0 : useTargetImage,
    bannerType === "product" ? targetProductId : null,
    bannerType === "category" ? targetCategoryId : null,
    bannerType === "products" ? targetProductIds.join(",") : "",
    bannerType === "image" ? linkUrl : null,
    sortOrder,
    isActive,
    now,
    id,
  );

  return NextResponse.json({ ok: true });
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
  db.prepare("DELETE FROM banners WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
