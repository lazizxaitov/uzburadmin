import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plumTestConnection } from "@/lib/plum";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await plumTestConnection();
    return NextResponse.json({
      ok: true,
      totalTransactions: Number(result.totalTransactions ?? 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось проверить подключение к Plum",
      },
      { status: 400 },
    );
  }
}
