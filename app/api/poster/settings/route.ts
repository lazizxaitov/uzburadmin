import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";
import { testPosterConnection } from "@/lib/poster";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = getDb().prepare("SELECT * FROM poster_settings WHERE id = 1").get();
  return NextResponse.json({ item });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const accountName = body?.accountName?.toString()?.trim() ?? "";
  const accessToken = body?.accessToken?.toString()?.trim() ?? "";
  const username = body?.username?.toString()?.trim() ?? "";
  const password = body?.password?.toString()?.trim() ?? "";
  const useToken = body?.useToken === false ? 0 : 1;
  const autoSyncEnabled = body?.autoSyncEnabled === true ? 1 : 0;
  const autoSyncIntervalMinutes = Math.max(
    1,
    Number(body?.autoSyncIntervalMinutes ?? 30) || 30
  );
  const webhookSecret = body?.webhookSecret?.toString()?.trim() ?? "";
  const sendOrdersToPoster = body?.sendOrdersToPoster === true ? 1 : 0;
  const orderSpotId = body?.orderSpotId?.toString()?.trim() ?? "";

  getDb().prepare(`
    UPDATE poster_settings
    SET account_name = ?, access_token = ?, username = ?, password = ?,
        use_token = ?, import_categories = ?, import_products = ?, import_images = ?,
        auto_sync_enabled = ?, auto_sync_interval_minutes = ?, webhook_secret = ?,
        send_orders_to_poster = ?, order_spot_id = ?,
        updated_at = ?
    WHERE id = 1
  `).run(
    accountName,
    accessToken,
    username,
    password,
    useToken,
    body?.importCategories === false ? 0 : 1,
    body?.importProducts === false ? 0 : 1,
    body?.importImages === false ? 0 : 1,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    webhookSecret,
    sendOrdersToPoster,
    orderSpotId,
    nowIso(),
  );

  return NextResponse.json({ ok: true });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = getDb().prepare("SELECT * FROM poster_settings WHERE id = 1").get() as {
    account_name: string;
    access_token: string;
    username: string;
    password: string;
    use_token: number;
  };

  try {
    await testPosterConnection({
      account_name: item.account_name,
      access_token: item.access_token,
      username: item.username,
      password: item.password,
      use_token: item.use_token,
    });
    getDb().prepare(`
      UPDATE poster_settings
      SET is_connected = 1, last_sync_status = 'Connection successful', last_sync_error = '', updated_at = ?
      WHERE id = 1
    `).run(nowIso());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poster connection failed";
    getDb().prepare(`
      UPDATE poster_settings
      SET is_connected = 0, last_sync_status = 'Connection failed', last_sync_error = ?, updated_at = ?
      WHERE id = 1
    `).run(message, nowIso());
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
