import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { runPosterSync } from "@/lib/poster-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret =
    request.headers.get("x-poster-webhook-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  const item = getDb()
    .prepare("SELECT webhook_secret FROM poster_settings WHERE id = 1")
    .get() as { webhook_secret?: string } | undefined;
  const expected = item?.webhook_secret?.trim() ?? "";

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPosterSync();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Poster sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
