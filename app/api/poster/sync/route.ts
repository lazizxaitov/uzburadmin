import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { runPosterSync } from "@/lib/poster-sync";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) {
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
