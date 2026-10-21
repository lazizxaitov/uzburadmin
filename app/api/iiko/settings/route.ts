import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";
import { fetchIikoOrganizations, fetchIikoReferences } from "@/lib/iiko";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const item = getDb().prepare("SELECT * FROM iiko_settings WHERE id = 1").get();
  return NextResponse.json({ item });
}

export async function PUT(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  getDb().prepare(`
    UPDATE iiko_settings SET
      base_url = ?, app_id = ?, client_secret = ?, api_login = ?,
      organization_id = ?, terminal_group_id = ?,
      order_type_id = ?, payment_type_id = ?, payment_type_kind = ?,
      import_categories = ?, import_products = ?, import_images = ?,
      auto_sync_enabled = ?, auto_sync_interval_minutes = ?,
      send_orders_to_iiko = ?, updated_at = ?
    WHERE id = 1
  `).run(
    body?.baseUrl?.toString().trim() || "https://api-ru.iiko.services",
    body?.appId?.toString().trim() || "",
    body?.clientSecret?.toString().trim() || "",
    body?.apiKey?.toString().trim() || body?.apiLogin?.toString().trim() || "",
    body?.organizationId?.toString().trim() || "",
    body?.terminalGroupId?.toString().trim() || "",
    body?.orderTypeId?.toString().trim() || "",
    body?.paymentTypeId?.toString().trim() || "",
    body?.paymentTypeKind?.toString().trim() || "Card",
    body?.importCategories === false ? 0 : 1,
    body?.importProducts === false ? 0 : 1,
    body?.importImages === false ? 0 : 1,
    body?.autoSyncEnabled === true ? 1 : 0,
    Math.max(1, Number(body?.autoSyncIntervalMinutes ?? 30) || 30),
    body?.sendOrdersToIiko === true ? 1 : 0,
    nowIso(),
  );
  return NextResponse.json({ ok: true });
}

export async function POST() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const settings = db.prepare("SELECT * FROM iiko_settings WHERE id = 1").get() as {
    base_url: string;
    app_id: string;
    client_secret: string;
    api_login: string;
    organization_id: string;
    terminal_group_id: string;
    order_type_id: string;
    payment_type_id: string;
  };

  try {
    const organizationsResult = await fetchIikoOrganizations(settings);
    const organizations = organizationsResult.organizations ?? [];
    const organizationId = settings.organization_id || organizations[0]?.id || "";
    if (!organizationId) throw new Error("Для API Login не найдены организации iiko");

    const references = await fetchIikoReferences(settings, organizationId);
    const terminalGroups = (references.terminals.terminalGroups ?? []) as Array<Record<string, unknown>>;
    const terminalItems = (terminalGroups.flatMap((group) =>
      Array.isArray(group.items) ? group.items : []
    )) as Array<Record<string, unknown>>;
    const orderGroups = (references.orderTypes.orderTypes ?? []) as Array<Record<string, unknown>>;
    const orderItems = (orderGroups.flatMap((group) =>
      Array.isArray(group.items) ? group.items : []
    )) as Array<Record<string, unknown>>;
    const paymentItems = Array.isArray(references.paymentTypes.paymentTypes)
      ? references.paymentTypes.paymentTypes as Array<Record<string, unknown>>
      : [];

    const terminalGroupId = settings.terminal_group_id || String(terminalItems[0]?.id ?? "");
    const orderType = orderItems.find(
      (item) => item.isDeleted !== true && item.orderServiceType === "DeliveryByCourier",
    ) ?? orderItems.find((item) => item.isDefault === true) ?? orderItems[0];
    const orderTypeId = settings.order_type_id || String(orderType?.id ?? "");
    const paymentType = paymentItems.find(
      (item) => item.isDeleted !== true && ["Card", "External"].includes(String(item.paymentTypeKind)),
    ) ?? paymentItems.find((item) => item.isDeleted !== true);
    const paymentTypeId = settings.payment_type_id || String(paymentType?.id ?? "");
    const paymentTypeKind = String(paymentType?.paymentTypeKind ?? "Card");

    db.prepare(`
      UPDATE iiko_settings SET
        organization_id = ?, terminal_group_id = ?, order_type_id = ?, payment_type_id = ?,
        payment_type_kind = ?,
        is_connected = 1, last_sync_status = 'Connection successful',
        last_sync_error = '', updated_at = ?
      WHERE id = 1
    `).run(organizationId, terminalGroupId, orderTypeId, paymentTypeId, paymentTypeKind, nowIso());

    return NextResponse.json({
      ok: true,
      organizations,
      terminalGroups: terminalItems,
      orderTypes: orderItems,
      paymentTypes: paymentItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "iiko connection failed";
    db.prepare(`
      UPDATE iiko_settings SET is_connected = 0,
        last_sync_status = 'Connection failed', last_sync_error = ?, updated_at = ?
      WHERE id = 1
    `).run(message, nowIso());
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
