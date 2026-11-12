import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";
import { fetchIikoOrganizations, fetchIikoReferences } from "@/lib/iiko";

export const runtime = "nodejs";

type Raw = Record<string, unknown>;

/**
 * Проверка API ключа iiko филиала. Возвращает организации, терминалы,
 * типы заказа и оплаты, чтобы выбрать их в форме филиала.
 * App ID / Client Secret / адрес API берутся из общих настроек iiko.
 */
export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Raw | null;
  const apiKey = String(body?.iikoApiKey ?? "").trim();
  const branchId = Number(body?.branchId ?? 0);
  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API ключ iiko филиала" }, { status: 400 });
  }

  const db = getDb();
  const global = db.prepare("SELECT base_url, app_id, client_secret FROM iiko_settings WHERE id = 1").get() as {
    base_url: string;
    app_id: string;
    client_secret: string;
  };
  if (!global?.app_id || !global?.client_secret) {
    return NextResponse.json(
      { error: "Сначала заполните App ID и Client Secret в Настройки → iiko" },
      { status: 400 },
    );
  }
  const settings = { ...global, api_login: apiKey };

  const saveStatus = (status: string, error: string) => {
    if (!branchId) return;
    db.prepare(
      "UPDATE branches SET iiko_check_status = ?, iiko_check_error = ?, updated_at = ? WHERE id = ?",
    ).run(status, error, nowIso(), branchId);
  };

  try {
    const organizations = (await fetchIikoOrganizations(settings)).organizations ?? [];
    const requestedOrg = String(body?.iikoOrganizationId ?? "").trim();
    const organizationId =
      organizations.find((item) => item.id === requestedOrg)?.id ?? organizations[0]?.id ?? "";
    if (!organizationId) throw new Error("Для этого API ключа не найдены организации iiko");

    const references = await fetchIikoReferences(settings, organizationId);
    const flatItems = (groups: unknown) =>
      (Array.isArray(groups) ? groups as Raw[] : []).flatMap((group) =>
        Array.isArray(group.items) ? group.items as Raw[] : [],
      );
    const terminalGroups = flatItems(references.terminals.terminalGroups).map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? item.id ?? ""),
      address: String(item.address ?? ""),
    }));
    const orderTypes = flatItems(references.orderTypes.orderTypes)
      .filter((item) => item.isDeleted !== true)
      .map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? item.id ?? ""),
        orderServiceType: String(item.orderServiceType ?? ""),
        isDefault: item.isDefault === true,
      }));
    const paymentTypes = (Array.isArray(references.paymentTypes.paymentTypes)
      ? references.paymentTypes.paymentTypes as Raw[]
      : [])
      .filter((item) => item.isDeleted !== true)
      .map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? item.id ?? ""),
        paymentTypeKind: String(item.paymentTypeKind ?? ""),
      }));

    const suggested = {
      iikoOrganizationId: organizationId,
      iikoTerminalGroupId: terminalGroups[0]?.id ?? "",
      iikoOrderTypeId: (
        orderTypes.find((item) => item.orderServiceType === "DeliveryByCourier") ??
        orderTypes.find((item) => item.isDefault) ??
        orderTypes[0]
      )?.id ?? "",
      iikoPaymentTypeId: (
        paymentTypes.find((item) => ["Card", "External"].includes(item.paymentTypeKind)) ??
        paymentTypes[0]
      )?.id ?? "",
    };

    saveStatus("Подключено", "");
    return NextResponse.json({
      ok: true,
      organizations,
      terminalGroups,
      orderTypes,
      paymentTypes,
      suggested,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка подключения к iiko";
    saveStatus("Ошибка", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
