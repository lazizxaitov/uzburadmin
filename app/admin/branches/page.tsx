"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MapPointPicker from "../_components/map-point-picker";

import { Card, GhostButton, Modal, PrimaryButton, SectionTitle } from "../_components/ui";

type Branch = {
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
};

type Option = { id: string; name: string };
type IikoRefs = {
  organizations: Option[];
  terminalGroups: Array<Option & { address?: string }>;
  orderTypes: Option[];
  paymentTypes: Array<Option & { paymentTypeKind: string }>;
};

const emptyForm = {
  name: "",
  address: "",
  coordinates: "",
  deliveryRadiusKm: "0",
  isActive: true,
  sortOrder: "0",
  iikoApiKey: "",
  iikoOrganizationId: "",
  iikoTerminalGroupId: "",
  iikoOrderTypeId: "",
  iikoPaymentTypeId: "",
  iikoPaymentTypeKind: "Card",
  paymeUrl: "",
  clickUrl: "",
};

const inputClass =
  "mt-1 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm";

/** «41.311, 69.279» или ссылка Яндекс/Google Карт → координаты. */
function parseCoordinates(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;
  // Яндекс: ...?ll=69.279,41.311 (долгота, широта) или pt=lng,lat
  const yandex = text.match(/[?&](?:ll|pt|whatshere%5Bpoint%5D)=([-\d.]+)(?:,|%2C)([-\d.]+)/i);
  if (yandex) return { lat: Number(yandex[2]), lng: Number(yandex[1]) };
  // Google: @41.311,69.279
  const google = text.match(/@([-\d.]+),([-\d.]+)/);
  if (google) return { lat: Number(google[1]), lng: Number(google[2]) };
  const pair = text.match(/([-\d.]+)\s*[,;\s]\s*([-\d.]+)/);
  if (pair) return { lat: Number(pair[1]), lng: Number(pair[2]) };
  return null;
}

function maskKey(key: string) {
  if (!key) return "не указан";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export default function BranchesPage() {
  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [refs, setRefs] = useState<IikoRefs | null>(null);
  // Адрес, подставленный с карты (его можно перезаписывать при смене точки).
  const autoAddressRef = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/branches");
      const data = await response.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setRefs(null);
    setError(null);
    setCheckMessage(null);
    setModalOpen(true);
  };

  const openEdit = (item: Branch) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      address: item.address,
      coordinates:
        item.latitude != null && item.longitude != null ? `${item.latitude}, ${item.longitude}` : "",
      deliveryRadiusKm: String(item.delivery_radius_km ?? 0),
      isActive: item.is_active === 1,
      sortOrder: String(item.sort_order ?? 0),
      iikoApiKey: item.iiko_api_key,
      iikoOrganizationId: item.iiko_organization_id,
      iikoTerminalGroupId: item.iiko_terminal_group_id,
      iikoOrderTypeId: item.iiko_order_type_id,
      iikoPaymentTypeId: item.iiko_payment_type_id,
      iikoPaymentTypeKind: item.iiko_payment_type_kind || "Card",
      paymeUrl: item.payme_url ?? "",
      clickUrl: item.click_url ?? "",
    });
    setRefs(null);
    setError(null);
    setCheckMessage(null);
    setModalOpen(true);
  };

  const coordinates = parseCoordinates(form.coordinates);

  const checkIiko = async () => {
    setChecking(true);
    setCheckMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/branches/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: editingId,
          iikoApiKey: form.iikoApiKey,
          iikoOrganizationId: form.iikoOrganizationId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ошибка проверки iiko");
      setRefs(data);
      // Заполняем пустые поля предложенными значениями.
      setForm((prev) => ({
        ...prev,
        iikoOrganizationId: data.suggested.iikoOrganizationId,
        iikoTerminalGroupId: prev.iikoTerminalGroupId || data.suggested.iikoTerminalGroupId,
        iikoOrderTypeId: prev.iikoOrderTypeId || data.suggested.iikoOrderTypeId,
        iikoPaymentTypeId: prev.iikoPaymentTypeId || data.suggested.iikoPaymentTypeId,
      }));
      setCheckMessage("Подключение к iiko успешно. Проверьте терминал и сохраните филиал.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка проверки iiko");
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    if (form.coordinates.trim() && !coordinates) {
      setError("Не удалось распознать координаты. Пример: 41.311081, 69.240562");
      setSaving(false);
      return;
    }
    const paymentKind =
      refs?.paymentTypes.find((item) => item.id === form.iikoPaymentTypeId)?.paymentTypeKind ||
      form.iikoPaymentTypeKind;
    const payload = {
      name: form.name,
      address: form.address,
      latitude: coordinates?.lat ?? null,
      longitude: coordinates?.lng ?? null,
      deliveryRadiusKm: Number(form.deliveryRadiusKm || 0),
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
      iikoApiKey: form.iikoApiKey,
      iikoOrganizationId: form.iikoOrganizationId,
      iikoTerminalGroupId: form.iikoTerminalGroupId,
      iikoOrderTypeId: form.iikoOrderTypeId,
      iikoPaymentTypeId: form.iikoPaymentTypeId,
      iikoPaymentTypeKind: paymentKind || "Card",
      paymeUrl: form.paymeUrl,
      clickUrl: form.clickUrl,
    };
    try {
      const response = await fetch(editingId ? `/api/branches/${editingId}` : "/api/branches", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Не удалось сохранить");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  /** Регистрирует в iiko вебхук: статусы заказов будут приходить автоматически. */
  const connectWebhooks = async () => {
    setWebhookBusy(true);
    setWebhookMessage(null);
    try {
      const response = await fetch("/api/iiko/webhooks", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok && !data?.results) throw new Error(data?.error ?? "Ошибка подключения");
      const lines = (data.results as Array<{ name: string; ok: boolean; error?: string }>).map(
        (item) => `${item.ok ? "✅" : "❌"} ${item.name}${item.error ? ` — ${item.error}` : ""}`,
      );
      setWebhookMessage(
        `Статусы заказов из iiko:\n${lines.join("\n")}\n\nБонусы клиенту начисляются автоматически, когда заказ в iiko становится «Доставлен» или «Закрыт».`,
      );
    } catch (err) {
      setWebhookMessage(`❌ ${err instanceof Error ? err.message : "Ошибка подключения"}`);
    } finally {
      setWebhookBusy(false);
    }
  };

  const remove = async (item: Branch) => {
    if (!window.confirm(`Удалить филиал «${item.name}»?`)) return;
    await fetch(`/api/branches/${item.id}`, { method: "DELETE" });
    await load();
  };

  const select = (
    label: string,
    field: "iikoOrganizationId" | "iikoTerminalGroupId" | "iikoOrderTypeId" | "iikoPaymentTypeId",
    options: Option[] | undefined,
  ) => (
    <label className="text-sm font-semibold">
      {label}
      {options?.length ? (
        <select
          value={form[field]}
          onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
          className={inputClass}
        >
          <option value="">— не выбрано —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={form[field]}
          placeholder="Заполнится после проверки"
          onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
          className={inputClass}
        />
      )}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle
          title="Филиалы"
          subtitle="Заказ автоматически уходит в ближайший к клиенту филиал, в радиус доставки которого попадает адрес, и отправляется в iiko этого филиала."
        />
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={connectWebhooks} disabled={webhookBusy}>
            {webhookBusy ? "Подключение…" : "Подключить статусы из iiko"}
          </GhostButton>
          <PrimaryButton onClick={openCreate}>Добавить филиал</PrimaryButton>
        </div>
      </div>

      {webhookMessage ? (
        <Card>
          <p className="whitespace-pre-line text-sm">{webhookMessage}</p>
        </Card>
      ) : null}

      {loading ? (
        <Card>Загрузка…</Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--muted)]">
            Филиалов пока нет — заказы работают как раньше, через общие настройки iiko.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-[var(--ink)]">{item.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.address || "Адрес не указан"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {item.is_active ? "Активен" : "Выключен"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                <span>
                  Координаты:{" "}
                  {item.latitude != null ? (
                    <a
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://yandex.uz/maps/?pt=${item.longitude},${item.latitude}&z=16`}
                    >
                      {item.latitude}, {item.longitude}
                    </a>
                  ) : (
                    <b className="text-[var(--danger)]">не указаны</b>
                  )}
                </span>
                <span>
                  Радиус: {item.delivery_radius_km > 0 ? `${item.delivery_radius_km} км` : "без ограничения"}
                </span>
                <span>iiko ключ: {maskKey(item.iiko_api_key)}</span>
                <span>
                  Оплата картой:{" "}
                  {[item.payme_url ? "Payme" : "", item.click_url ? "Click" : ""]
                    .filter(Boolean)
                    .join(", ") || "общая (Plum)"}
                </span>
                {item.iiko_check_status ? (
                  <span
                    className={
                      item.iiko_check_error ? "text-[var(--danger)]" : "text-emerald-700"
                    }
                    title={item.iiko_check_error}
                  >
                    iiko: {item.iiko_check_status}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                <GhostButton onClick={() => openEdit(item)}>Изменить</GhostButton>
                <GhostButton onClick={() => remove(item)}>Удалить</GhostButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Филиал" : "Новый филиал"}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={submit} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </PrimaryButton>
            {error ? <span className="text-sm font-semibold text-[var(--danger)]">{error}</span> : null}
          </div>
        }
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Название
              <input
                value={form.name}
                placeholder="Uzbur Чиланзар"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-semibold">
              Адрес филиала
              <input
                value={form.address}
                placeholder="ул. Бунёдкор, 12"
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <div className="text-sm font-semibold">
            Местоположение филиала
            <div className="mt-1">
              <MapPointPicker
                value={coordinates}
                onChange={(point) =>
                  setForm((prev) => ({ ...prev, coordinates: `${point.lat}, ${point.lng}` }))
                }
                onAddress={(address) =>
                  // Адрес подставляем, только если его ещё не вводили вручную.
                  setForm((prev) =>
                    !prev.address.trim() || prev.address === autoAddressRef.current
                      ? ((autoAddressRef.current = address), { ...prev, address })
                      : prev,
                  )
                }
              />
            </div>
            <details className="mt-2 text-xs font-normal text-[var(--muted)]">
              <summary className="cursor-pointer">Ввести координаты вручную</summary>
              <input
                value={form.coordinates}
                placeholder="41.311081, 69.240562 — или ссылка из Яндекс/Google Карт"
                onChange={(event) => setForm((prev) => ({ ...prev, coordinates: event.target.value }))}
                className={inputClass}
              />
            </details>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-semibold">
              Радиус доставки, км
              <input
                type="number"
                min={0}
                step="0.5"
                value={form.deliveryRadiusKm}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deliveryRadiusKm: event.target.value }))
                }
                className={inputClass}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">0 — без ограничения</span>
            </label>
            <label className="text-sm font-semibold">
              Порядок
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Принимает заказы
            </label>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--stroke)] p-4">
            <p className="text-sm font-extrabold text-[var(--ink)]">Оплата картой</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold">
                Ссылка Payme
                <input
                  value={form.paymeUrl}
                  placeholder="https://payme.uz/..."
                  onChange={(event) => setForm((prev) => ({ ...prev, paymeUrl: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-semibold">
                Ссылка Click
                <input
                  value={form.clickUrl}
                  placeholder="https://my.click.uz/..."
                  onChange={(event) => setForm((prev) => ({ ...prev, clickUrl: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Клиент, выбравший оплату картой, выберет Payme или Click и перейдёт по ссылке этого
              филиала. В ссылке можно использовать <code>{"{amount}"}</code> (сумма в сумах),{" "}
              <code>{"{amount_tiyin}"}</code> (сумма в тийинах) и <code>{"{order}"}</code> (номер
              заказа) — они подставятся автоматически. Если ссылок нет, используется общая оплата
              картой (Plum).
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--stroke)] p-4">
            <p className="text-sm font-extrabold text-[var(--ink)]">iiko филиала</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-sm font-semibold">
                API ключ iiko
                <input
                  value={form.iikoApiKey}
                  placeholder="iikoWeb → Интеграции → API ключи"
                  onChange={(event) => setForm((prev) => ({ ...prev, iikoApiKey: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <GhostButton onClick={checkIiko} disabled={checking || !form.iikoApiKey.trim()}>
                {checking ? "Проверка…" : "Проверить iiko"}
              </GhostButton>
            </div>
            {checkMessage ? <p className="text-xs font-semibold text-emerald-700">{checkMessage}</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              {select("Организация", "iikoOrganizationId", refs?.organizations)}
              {select("Терминал (касса)", "iikoTerminalGroupId", refs?.terminalGroups)}
              {select("Тип заказа", "iikoOrderTypeId", refs?.orderTypes)}
              {select("Тип оплаты картой", "iikoPaymentTypeId", refs?.paymentTypes)}
            </div>
            <p className="text-xs text-[var(--muted)]">
              App ID и Client Secret берутся из общих настроек iiko. Отправка заказов включается там же
              переключателем «Отправлять заказы в iiko».
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
