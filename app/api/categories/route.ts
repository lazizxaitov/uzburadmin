import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const categories = db
    .prepare("SELECT * FROM categories ORDER BY sort_order ASC, created_at DESC")
    .all();

  return NextResponse.json({ items: categories });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nameRu = body?.nameRu?.toString()?.trim();
  const nameUz = body?.nameUz?.toString()?.trim();
  const slugInput = body?.slug?.toString()?.trim();
  const imageUrl = body?.imageUrl?.toString()?.trim() ?? null;
  const isActive = body?.isActive === undefined ? 1 : body.isActive ? 1 : 0;

  if (!nameRu || !nameUz) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const db = getDb();
  let slug = slugInput ? slugify(slugInput) : slugify(nameRu);
  const exists = db
    .prepare("SELECT COUNT(1) as count FROM categories WHERE slug = ?")
    .get(slug) as { count: number };
  if (exists.count > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  const now = nowIso();
  const lastOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM categories")
    .get() as { maxOrder: number };
  const sortOrder = (lastOrder?.maxOrder ?? 0) + 1;
  const result = db
    .prepare(
      `INSERT INTO categories (name_ru, name_uz, slug, image_url, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nameRu, nameUz, slug, imageUrl, sortOrder, isActive, now, now);

  return NextResponse.json({ id: result.lastInsertRowid });
}
