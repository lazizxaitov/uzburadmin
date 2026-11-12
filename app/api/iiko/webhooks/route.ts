import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { registerIikoWebhooks } from "@/lib/iiko-status-sync";

export const runtime = "nodejs";

/** Подключает вебхук статусов заказов в iiko (общая организация + все филиалы). */
export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (!host || /localhost|127\.0\.0\.1/.test(host)) {
    return NextResponse.json(
      { error: "Подключайте вебхук с боевого адреса админки (https://uzburadmin.uz)" },
      { status: 400 },
    );
  }
  try {
    const results = await registerIikoWebhooks(`${proto}://${host}/api/iiko/webhook`);
    if (!results.length) {
      return NextResponse.json({ error: "Нет настроенных организаций iiko" }, { status: 400 });
    }
    return NextResponse.json({ ok: results.every((item) => item.ok), results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка iiko" },
      { status: 400 },
    );
  }
}
