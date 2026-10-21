import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { runIikoSync } from "@/lib/iiko-sync";

export const runtime = "nodejs";

export async function POST() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runIikoSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : "iiko sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
