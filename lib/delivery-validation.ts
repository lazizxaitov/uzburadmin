import "server-only";

const TASHKENT_TIME_ZONE = "Asia/Tashkent";
const EARTH_RADIUS_KM = 6371;

export type DeliveryAddress = {
  latitude?: number | null;
  longitude?: number | null;
} | null;

export type DeliverySettings = {
  work_hours?: string | null;
  delivery_zone_enabled?: number | null;
  delivery_center_lat?: number | null;
  delivery_center_lng?: number | null;
  delivery_radius_km?: number | null;
};

function toRadians(value: number) {
  return value * (Math.PI / 180);
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lng2 - lng1);
  const latitude1 = toRadians(lat1);
  const latitude2 = toRadians(lat2);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function parseWorkHours(value: string) {
  const match = value.match(
    /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/,
  );
  if (!match) return null;
  return {
    opensAt: Number(match[1]) * 60 + Number(match[2]),
    closesAt: Number(match[3]) * 60 + Number(match[4]),
  };
}

function isAlwaysOpen(value: string) {
  return /^(24\s*\/\s*7|круглосуточно)$/i.test(value.trim());
}

export function validateDeliveryConfiguration(settings: DeliverySettings) {
  const workHours = settings.work_hours?.trim() ?? "";
  if (workHours && !isAlwaysOpen(workHours) && !parseWorkHours(workHours)) {
    return "Укажите часы работы в формате 09:00-23:00 или Круглосуточно";
  }
  if (Number(settings.delivery_zone_enabled ?? 0) !== 1) return null;

  const centerLat = Number(settings.delivery_center_lat);
  const centerLng = Number(settings.delivery_center_lng);
  const radiusKm = Number(settings.delivery_radius_km);
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(radiusKm) ||
    centerLat < -90 ||
    centerLat > 90 ||
    centerLng < -180 ||
    centerLng > 180 ||
    radiusKm <= 0
  ) {
    return "Проверьте центр и радиус зоны доставки";
  }
  return null;
}

function currentTashkentMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hours = Number(parts.find((item) => item.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((item) => item.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}

function isOpenNow(workHours: string, now: Date) {
  const schedule = parseWorkHours(workHours);
  if (!schedule || schedule.opensAt === schedule.closesAt) return true;
  const current = currentTashkentMinutes(now);
  if (schedule.opensAt < schedule.closesAt) {
    return current >= schedule.opensAt && current < schedule.closesAt;
  }
  return current >= schedule.opensAt || current < schedule.closesAt;
}

export function validateDelivery(
  address: DeliveryAddress,
  settings: DeliverySettings,
  now = new Date(),
): { ok: true } | { ok: false; error: string } {
  const workHours = settings.work_hours?.trim() ?? "";
  if (workHours && !isAlwaysOpen(workHours) && !parseWorkHours(workHours)) {
    return { ok: false, error: "Часы работы настроены неверно" };
  }
  if (workHours && !isAlwaysOpen(workHours) && !isOpenNow(workHours, now)) {
    return { ok: false, error: `Сейчас заведение закрыто. Часы работы: ${workHours}` };
  }

  const latitude = address?.latitude == null ? null : Number(address.latitude);
  const longitude = address?.longitude == null ? null : Number(address.longitude);
  const hasAnyCoordinate = latitude != null || longitude != null;
  if (
    hasAnyCoordinate &&
    (!Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude! < -90 ||
      latitude! > 90 ||
      longitude! < -180 ||
      longitude! > 180)
  ) {
    return { ok: false, error: "Некорректные координаты адреса" };
  }

  if (Number(settings.delivery_zone_enabled ?? 0) !== 1) return { ok: true };
  if (latitude == null || longitude == null) {
    return { ok: false, error: "Выберите адрес на карте" };
  }

  const centerLat = Number(settings.delivery_center_lat);
  const centerLng = Number(settings.delivery_center_lng);
  const radiusKm = Number(settings.delivery_radius_km);
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(radiusKm) ||
    centerLat < -90 ||
    centerLat > 90 ||
    centerLng < -180 ||
    centerLng > 180 ||
    radiusKm <= 0
  ) {
    return { ok: false, error: "Зона доставки не настроена" };
  }

  if (distanceKm(centerLat, centerLng, latitude, longitude) > radiusKm) {
    return { ok: false, error: "Адрес находится вне зоны доставки" };
  }
  return { ok: true };
}
