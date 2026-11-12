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
  /** Часы работы "HH:MM" (время Ташкента). Пусто — круглосуточно. */
  open_time: string;
  close_time: string;
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

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string) {
  const match = TIME_RE.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Текущее время в Ташкенте (UTC+5, без перехода на летнее время), минуты от полуночи. */
function tashkentMinutesNow(now = new Date()) {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60) % (24 * 60);
}

/** Открыт ли филиал сейчас. Поддерживает работу через полночь (10:00–02:00). */
export function isBranchOpen(branch: Pick<Branch, "open_time" | "close_time">, now = new Date()) {
  const open = toMinutes(branch.open_time);
  const close = toMinutes(branch.close_time);
  if (open == null || close == null || open === close) return true;
  const current = tashkentMinutesNow(now);
  return open < close ? current >= open && current < close : current >= open || current < close;
}

export function branchHoursText(branch: Pick<Branch, "open_time" | "close_time">) {
  return branch.open_time && branch.close_time ? `${branch.open_time}–${branch.close_time}` : "";
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

  const openBranches = branches.filter((branch) => isBranchOpen(branch));
  if (!openBranches.length) {
    return { ok: false, error: "Сейчас все филиалы закрыты" };
  }

  if (!hasPoint || !located.length) {
    // Без координат определить ближайший филиал нельзя — берём первый открытый по порядку.
    return { ok: true, branch: openBranches[0], distanceKm: null };
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
  // Ближайший из открытых сейчас филиалов, в зону которых попадает адрес.
  const open = candidates.find(({ branch }) => isBranchOpen(branch));
  if (!open) {
    const hours = branchHoursText(candidates[0].branch);
    return {
      ok: false,
      error: `Филиал «${candidates[0].branch.name}» сейчас закрыт${hours ? ` (работает ${hours})` : ""}`,
    };
  }
  return {
    ok: true,
    branch: open.branch,
    distanceKm: Math.round(open.distance * 100) / 100,
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
  openTime: string;
  closeTime: string;
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
  const openTime = text("openTime");
  const closeTime = text("closeTime");
  if ((openTime || closeTime) && (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime))) {
    return { ok: false, error: "Укажите время открытия и закрытия в формате ЧЧ:ММ" };
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
      openTime: text("openTime"),
      closeTime: text("closeTime"),
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
    input.openTime,
    input.closeTime,
  ];
  if (id) {
    db.prepare(`
      UPDATE branches SET
        name = ?, address = ?, latitude = ?, longitude = ?, delivery_radius_km = ?,
        is_active = ?, sort_order = ?, iiko_api_key = ?, iiko_organization_id = ?,
        iiko_terminal_group_id = ?, iiko_order_type_id = ?, iiko_payment_type_id = ?,
        iiko_payment_type_kind = ?, payme_url = ?, click_url = ?, open_time = ?, close_time = ?, updated_at = ?
      WHERE id = ?
    `).run(...values, now, id);
    return id;
  }
  const result = db.prepare(`
    INSERT INTO branches (
      name, address, latitude, longitude, delivery_radius_km, is_active, sort_order,
      iiko_api_key, iiko_organization_id, iiko_terminal_group_id, iiko_order_type_id,
      iiko_payment_type_id, iiko_payment_type_kind, payme_url, click_url, open_time, close_time, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...values, now, now);
  return Number(result.lastInsertRowid);
}
