import { NextResponse } from "next/server";

import { applyIikoOrderUpdate, getWebhookToken } from "@/lib/iiko-status-sync";

export const runtime = "nodejs";

/**
 * Приёмник вебхуков iiko (DeliveryOrderUpdate). iiko присылает массив событий
 * и токен из настроек вебхука в заголовке Authorization.
 */
export async function POST(request: Request) {
  const token = getWebhookToken();
  const header = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || header !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const events = Array.isArray(body) ? body : body ? [body] : [];
  let updated = 0;
  for (const event of events as Array<Record<string, unknown>>) {
    if (event?.eventType !== "DeliveryOrderUpdate") continue;
    const info = event.eventInfo as Record<string, unknown> | undefined;
    if (info && applyIikoOrderUpdate(info)) updated += 1;
  }
  return NextResponse.json({ ok: true, updated });
}
