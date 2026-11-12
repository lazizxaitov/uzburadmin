import "server-only";

import { getDb, nowIso } from "@/lib/db";

export type Branch = {
  id: number;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  delivery_radius_km: number;
  is_active: number;
  sort_order: number;
  iiko_api_key: string;
  iiko_organization_id: string;
  iiko_terminal_group_id: string;
  iiko_order_type_id: string;
  iiko_payment_type_id: string;
  iiko_payment_type_kind: string;
  iiko_check_status: string;
  iiko_check_error: string;
  payme_url: string;
  click_url: string;
  created_at: string;
  updated_at: string;
};

export function listBranches({ onlyActive = false } = {}) {
  return getDb().prepare(`
    SELECT * FROM branches
    ${onlyActive ? "WHERE is_active = 1" : ""}
    ORDER BY sort_order ASC, id ASC
  `).all() as Branch[];
}

export function getBranch(id: number) {
  return getDb().prepare("SELECT * FROM branches WHERE id = ?").get(id) as Branch | undefined;
}

/** Расстояние между точками, км (формула гаверсинусов). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type BranchResolution =
  | { ok: true; branch: Branch | null; distanceKm: number | null }
  | { ok: false; error: string };

/**
 * Выбирает филиал для заказа: ближайший активный филиал, в радиус доставки
 * которого попадает адрес (радиус 0 — без ограничения).
 * Если филиалов нет — заказ работает как раньше (branch = null).
 */
export function resolveBranchForAddress(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): BranchResolution {
  const branches = listBranches({ onlyActive: true });
  if (!branches.length) return { ok: true, branch: null, distanceKm: null };

  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasPoint =
    latitude != null && longitude != null && Number.isFinite(lat) && Number.isFinite(lng);
  const located = branches.filter(
    (branch) => branch.latitude != null && branch.longitude != null,
  );

  if (!hasPoint || !located.length) {
    // Без координат определить ближайший филиал нельзя — берём первый по порядку.
    return { ok: true, branch: branches[0], distanceKm: null };
  }

  const candidates = located
    .map((branch) => ({
      branch,
      distance: distanceKm(lat, lng, branch.latitude!, branch.longitude!),
    }))
    .filter(
      ({ branch, distance }) =>
        !(branch.delivery_radius_km > 0) || distance <= branch.delivery_radius_km,
    )
    .sort((a, b) => a.distance - b.distance);

  if (!candidates.length) {
    return { ok: false, error: "Ваш адрес вне зоны доставки наших филиалов" };
  }
  return {
    ok: true,
    branch: candidates[0].branch,
    distanceKm: Math.round(candidates[0].distance * 100) / 100,
  };
}

export type BranchInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusKm: number;
  isActive: boolean;
  sortOrder: number;
  iikoApiKey: string;
  iikoOrganizationId: string;
  iikoTerminalGroupId: string;
  iikoOrderTypeId: string;
  iikoPaymentTypeId: string;
  iikoPaymentTypeKind: string;
  paymeUrl: string;
  clickUrl: string;
};

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function parseBranchInput(body: unknown): { ok: true; value: BranchInput } | { ok: false; error: string } {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const text = (key: string) => (record[key] == null ? "" : String(record[key]).trim());
  const name = text("name");
  if (!name) return { ok: false, error: "Укажите название филиала" };
  const latitude = optionalNumber(record.latitude);
  const longitude = optionalNumber(record.longitude);
  if ((latitude == null) !== (longitude == null)) {
    return { ok: false, error: "Укажите обе координаты филиала" };
  }
  if (latitude != null && (latitude < -90 || latitude > 90 || longitude! < -180 || longitude! > 180)) {
    return { ok: false, error: "Неверные координаты филиала" };
  }
  for (const key of ["paymeUrl", "clickUrl"]) {
    const url = text(key);
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "Ссылка на оплату должна начинаться с https://" };
    }
  }
  return {
    ok: true,
    value: {
      name,
      address: text("address"),
      latitude,
      longitude,
      deliveryRadiusKm: Math.max(0, optionalNumber(record.deliveryRadiusKm) ?? 0),
      isActive: record.isActive !== false,
      sortOrder: Math.round(optionalNumber(record.sortOrder) ?? 0),
      iikoApiKey: text("iikoApiKey"),
      iikoOrganizationId: text("iikoOrganizationId"),
      iikoTerminalGroupId: text("iikoTerminalGroupId"),
      iikoOrderTypeId: text("iikoOrderTypeId"),
      iikoPaymentTypeId: text("iikoPaymentTypeId"),
      iikoPaymentTypeKind: text("iikoPaymentTypeKind") || "Card",
      paymeUrl: text("paymeUrl"),
      clickUrl: text("clickUrl"),
    },
  };
}

export function saveBranch(input: BranchInput, id?: number) {
  const db = getDb();
  const now = nowIso();
  const values = [
    input.name,
    input.address,
    input.latitude,
    input.longitude,
    input.deliveryRadiusKm,
    input.isActive ? 1 : 0,
    input.sortOrder,
    input.iikoApiKey,
    input.iikoOrganizationId,
    input.iikoTerminalGroupId,
    input.iikoOrderTypeId,
    input.iikoPaymentTypeId,
    input.iikoPaymentTypeKind,
    input.paymeUrl,
    input.clickUrl,
  ];
  if (id) {
    db.prepare(`
      UPDATE branches SET
        name = ?, address = ?, latitude = ?, longitude = ?, delivery_radius_km = ?,
        is_active = ?, sort_order = ?, iiko_api_key = ?, iiko_organization_id = ?,
        iiko_terminal_group_id = ?, iiko_order_type_id = ?, iiko_payment_type_id = ?,
        iiko_payment_type_kind = ?, payme_url = ?, click_url = ?, updated_at = ?
      WHERE id = ?
    `).run(...values, now, id);
    return id;
  }
  const result = db.prepare(`
    INSERT INTO branches (
      name, address, latitude, longitude, delivery_radius_km, is_active, sort_order,
      iiko_api_key, iiko_organization_id, iiko_terminal_group_id, iiko_order_type_id,
      iiko_payment_type_id, iiko_payment_type_kind, payme_url, click_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...values, now, now);
  return Number(result.lastInsertRowid);
}
