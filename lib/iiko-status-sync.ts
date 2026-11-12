import "server-only";

import crypto from "node:crypto";

import { listBranches, type Branch } from "@/lib/branches";
import { getDb, nowIso } from "@/lib/db";
import {
  fetchIikoDeliveriesById,
  updateIikoWebhookSettings,
  type IikoSettings,
} from "@/lib/iiko";
import { applyOrderStatus, mapIikoStatus } from "@/lib/order-status";

type GlobalIiko = IikoSettings & {
  organization_id: string;
  webhook_token: string;
  last_status_poll_at: string;
};

function globalSettings() {
  return getDb().prepare("SELECT * FROM iiko_settings WHERE id = 1").get() as GlobalIiko;
}

/** Настройки iiko для филиала (свой ключ и организация) или общие. */
function settingsFor(branch: Branch | undefined, global: GlobalIiko) {
  if (branch && branch.iiko_api_key) {
    return {
      settings: { ...global, api_login: branch.iiko_api_key },
      organizationId: branch.iiko_organization_id,
    };
  }
  return { settings: global as IikoSettings, organizationId: global.organization_id };
}

/** Применяет статус iiko к заказу (по id заказа в iiko или по нашему номеру). */
export function applyIikoOrderUpdate(info: Record<string, unknown>) {
  const iikoOrderId = String(info.id ?? "").trim();
  const externalNumber = String(info.externalNumber ?? "").trim();
  const order = (info.order ?? {}) as Record<string, unknown>;
  const iikoStatus = String(order.status ?? "").trim();
  if (!iikoStatus || (!iikoOrderId && !externalNumber)) return false;

  const db = getDb();
  const row = db.prepare(`
    SELECT id FROM orders
    WHERE (iiko_order_id != '' AND iiko_order_id = ?) OR (external_id IS NOT NULL AND external_id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(iikoOrderId, externalNumber) as { id: number } | undefined;
  if (!row) return false;

  if (iikoOrderId) {
    db.prepare("UPDATE orders SET iiko_order_id = ? WHERE id = ? AND iiko_order_id = ''").run(iikoOrderId, row.id);
  }
  const status = mapIikoStatus(iikoStatus);
  if (!status) {
    db.prepare("UPDATE orders SET iiko_status = ? WHERE id = ?").run(iikoStatus, row.id);
    return false;
  }
  const cancelInfo = (order.cancelInfo ?? {}) as Record<string, unknown>;
  const cause = (cancelInfo.cause ?? {}) as Record<string, unknown>;
  const result = applyOrderStatus(row.id, status, {
    forwardOnly: true,
    iikoStatus,
    cancelReason: String(cancelInfo.comment ?? cause.name ?? "").trim(),
  });
  return result.ok && result.changed;
}

let pollInFlight: Promise<void> | null = null;
const POLL_INTERVAL_MS = 60_000;

/**
 * Запасной способ, если вебхук не пришёл: раз в минуту (не чаще) запрашивает
 * статусы незавершённых заказов за последние 2 дня через deliveries/by_id.
 */
export async function pollIikoOrderStatuses() {
  if (pollInFlight) return pollInFlight;
  const global = globalSettings();
  if (!global?.app_id || !global?.client_secret) return;
  const last = global.last_status_poll_at ? Date.parse(global.last_status_poll_at) : 0;
  if (last && Date.now() - last < POLL_INTERVAL_MS) return;

  pollInFlight = (async () => {
    const db = getDb();
    db.prepare("UPDATE iiko_settings SET last_status_poll_at = ? WHERE id = 1").run(nowIso());
    const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    const orders = db.prepare(`
      SELECT id, iiko_order_id, branch_id FROM orders
      WHERE iiko_order_id != '' AND status NOT IN ('delivered', 'canceled') AND created_at >= ?
      LIMIT 200
    `).all(since) as Array<{ id: number; iiko_order_id: string; branch_id: number | null }>;
    if (!orders.length) return;

    const branches = new Map(listBranches().map((branch) => [branch.id, branch]));
    const groups = new Map<string, { branch?: Branch; ids: string[] }>();
    for (const order of orders) {
      const key = order.branch_id ? `b${order.branch_id}` : "global";
      const group = groups.get(key) ?? {
        branch: order.branch_id ? branches.get(order.branch_id) : undefined,
        ids: [],
      };
      group.ids.push(order.iiko_order_id);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const { settings, organizationId } = settingsFor(group.branch, global);
      if (!settings.api_login || !organizationId) continue;
      try {
        const response = await fetchIikoDeliveriesById(settings, organizationId, group.ids);
        for (const info of response.orders ?? []) applyIikoOrderUpdate(info);
      } catch {
        // iiko недоступен — попробуем при следующем опросе.
      }
    }
  })().finally(() => {
    pollInFlight = null;
  });
  return pollInFlight;
}

/** Токен, которым iiko подписывает вебхуки (создаётся один раз). */
export function getWebhookToken() {
  const global = globalSettings();
  if (global.webhook_token) return global.webhook_token;
  const token = crypto.randomBytes(24).toString("hex");
  getDb().prepare("UPDATE iiko_settings SET webhook_token = ? WHERE id = 1").run(token);
  return token;
}

/** Регистрирует вебхук статусов заказов в iiko: для общей организации и каждого филиала. */
export async function registerIikoWebhooks(webHooksUri: string) {
  const global = globalSettings();
  if (!global?.app_id || !global?.client_secret) {
    throw new Error("Заполните App ID и Client Secret в настройках iiko");
  }
  const authToken = getWebhookToken();
  const targets: Array<{ name: string; settings: IikoSettings; organizationId: string }> = [];
  if (global.api_login && global.organization_id) {
    targets.push({ name: "Общие настройки iiko", settings: global, organizationId: global.organization_id });
  }
  for (const branch of listBranches({ onlyActive: true })) {
    if (!branch.iiko_api_key || !branch.iiko_organization_id) continue;
    const { settings, organizationId } = settingsFor(branch, global);
    targets.push({ name: branch.name, settings, organizationId });
  }

  const seen = new Set<string>();
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  for (const target of targets) {
    const key = `${target.settings.api_login}:${target.organizationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await updateIikoWebhookSettings(target.settings, {
        organizationId: target.organizationId,
        webHooksUri,
        authToken,
      });
      results.push({ name: target.name, ok: true });
    } catch (error) {
      results.push({
        name: target.name,
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка iiko",
      });
    }
  }
  return results;
}

/** Опрос статусов, но не дольше timeoutMs — чтобы не задерживать ответ клиенту. */
export async function pollIikoOrderStatusesQuick(timeoutMs = 4000) {
  await Promise.race([
    pollIikoOrderStatuses().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
