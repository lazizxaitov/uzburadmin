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
  const banners = db
    .prepare("SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC")
    .all();

  return NextResponse.json({ items: banners });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const result = db
    .prepare(
      `INSERT INTO banners (title_ru, title_uz, image_url, banner_type, target_product_id, target_category_id, link_url, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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
      now,
    );

  return NextResponse.json({ id: result.lastInsertRowid });
}
