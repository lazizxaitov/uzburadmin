import { NextRequest, NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { slugify } from "@/lib/slug";

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
  const nameRu = body?.nameRu?.toString()?.trim();
  const nameUz = body?.nameUz?.toString()?.trim();
  const imageUrl = body?.imageUrl?.toString()?.trim() ?? null;
  const slugInput = body?.slug?.toString()?.trim();
  const sortOrder =
    body?.sortOrder !== undefined ? Number(body.sortOrder) : undefined;
  const isActive =
    body?.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined;

  if (!nameRu || !nameUz) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const db = getDb();
  const slug = slugInput ? slugify(slugInput) : slugify(nameRu);
  const exists = db
    .prepare("SELECT id FROM categories WHERE slug = ? AND id != ?")
    .get(slug, id) as { id: number } | undefined;
  if (exists) {
    return NextResponse.json(
      { error: "Категория с таким slug уже существует" },
      { status: 409 }
    );
  }

  const current = db
    .prepare("SELECT sort_order, is_active FROM categories WHERE id = ?")
    .get(id) as { sort_order?: number; is_active?: number } | undefined;

  const now = nowIso();
  db.prepare(
    `UPDATE categories
     SET name_ru = ?, name_uz = ?, slug = ?, image_url = ?, sort_order = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nameRu,
    nameUz,
    slug,
    imageUrl,
    sortOrder ?? Number(current?.sort_order ?? 0),
    isActive ?? Number(current?.is_active ?? 1),
    now,
    id
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
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
