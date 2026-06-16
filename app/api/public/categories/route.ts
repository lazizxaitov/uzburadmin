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
  const items = db
    .prepare(
      "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC"
    )
    .all();
  return NextResponse.json({ items });
}
