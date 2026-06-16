import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { testEskizConnection } from "@/lib/eskiz";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await testEskizConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eskiz test failed" },
      { status: 400 }
    );
  }
}
