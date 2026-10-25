import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { maybeAutoSyncPoster } from "@/lib/poster-sync";
import { maybeAutoSyncIiko } from "@/lib/iiko-sync";
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
  await Promise.all([maybeAutoSyncPoster(), maybeAutoSyncIiko()]);

  const db = getDb();
  const items = db
    .prepare(`
      SELECT c.*, COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY product_count DESC, c.sort_order ASC, c.created_at DESC
    `)
    .all();
  return NextResponse.json({ items });
}
