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
  const bannerType = body?.bannerType === "product" || body?.bannerType === "category" ? body.bannerType : "image";
  const targetProductId = body?.targetProductId ? Number(body.targetProductId) : null;
  const targetCategoryId = body?.targetCategoryId ? Number(body.targetCategoryId) : null;
  const linkUrl = body?.linkUrl?.toString()?.trim() ?? null;
  const sortOrder = Number(body?.sortOrder ?? 0);
  const isActive = body?.isActive === false ? 0 : 1;

  if (!titleRu || !titleUz || !imageUrl) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE banners
     SET title_ru = ?, title_uz = ?, image_url = ?, banner_type = ?, target_product_id = ?, target_category_id = ?, link_url = ?, sort_order = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    titleRu,
    titleUz,
    imageUrl,
    bannerType,
    bannerType === "product" ? targetProductId : null,
    bannerType === "category" ? targetCategoryId : null,
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
