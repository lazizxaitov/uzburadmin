"use client";

import { useEffect, useState } from "react";

import { Card, GhostButton, PrimaryButton, SectionTitle } from "../_components/ui";
import ImageCropper from "../_components/image-cropper";

type Settings = {
  cafe_name: string;
  phone: string;
  address: string;
  work_hours: string;
  delivery_fee: number;
  min_order: number;
  currency: string;
  bonus_percent: number;
  bonus_redeem_amount: number;
  support_phone: string;
  instagram: string;
  telegram: string;
  splash_image_url: string;
  splash_title_ru: string;
  splash_title_uz: string;
  splash_subtitle_ru: string;
  splash_subtitle_uz: string;
  splash_show_once: number;
  catalog_mode: string;
  mobile_api_key: string;
  plum_base_url: string;
  plum_username: string;
  plum_password: string;
  eskiz_enabled: number;
  eskiz_email: string;
  eskiz_password: string;
  eskiz_from: string;
  eskiz_callback_url: string;
  cashier_username: string;
  cashier_password: string;
};

type PosterSettings = {
  account_name: string;
  access_token: string;
  username: string;
  password: string;
  use_token: number;
  import_categories: number;
  import_products: number;
  import_images: number;
  is_connected: number;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_error: string;
  auto_sync_enabled: number;
  auto_sync_interval_minutes: number;
  webhook_secret: string;
  send_orders_to_poster: number;
  order_spot_id: string;
};

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>({
    cafe_name: "",
    phone: "",
    address: "",
    work_hours: "",
    delivery_fee: 0,
    min_order: 0,
    currency: "сум",
    bonus_percent: 0,
    bonus_redeem_amount: 0,
    support_phone: "",
    instagram: "",
    telegram: "",
    splash_image_url: "",
    splash_title_ru: "",
    splash_title_uz: "",
    splash_subtitle_ru: "",
    splash_subtitle_uz: "",
    splash_show_once: 1,
    catalog_mode: "real",
    mobile_api_key: "",
    plum_base_url: "https://pay.myuzcard.uz",
    plum_username: "",
    plum_password: "",
    eskiz_enabled: 0,
    eskiz_email: "",
    eskiz_password: "",
    eskiz_from: "4546",
    eskiz_callback_url: "",
    cashier_username: "uzburkassa",
    cashier_password: "kassa123",
  });
  const [poster, setPoster] = useState<PosterSettings>({
    account_name: "",
    access_token: "",
    username: "",
    password: "",
    use_token: 1,
    import_categories: 1,
    import_products: 1,
    import_images: 1,
    is_connected: 0,
    last_sync_at: null,
    last_sync_status: "",
    last_sync_error: "",
    auto_sync_enabled: 0,
    auto_sync_interval_minutes: 30,
    webhook_secret: "",
    send_orders_to_poster: 0,
    order_spot_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingPlum, setTestingPlum] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [testingEskiz, setTestingEskiz] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState("image/jpeg");
  const [plumStatus, setPlumStatus] = useState<{
    ok: boolean | null;
    text: string;
  }>({ ok: null, text: "Не проверено" });

  const load = async () => {
    setLoading(true);
    const [settingsRes, posterRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/poster/settings"),
    ]);
    const settingsData = await settingsRes.json();
    const posterData = await posterRes.json();
    if (settingsData?.item) {
      setForm(settingsData.item);
    }
    if (posterData?.item) {
      setPoster(posterData.item);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    await Promise.all([
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cafeName: form.cafe_name,
          phone: form.phone,
          address: form.address,
          workHours: form.work_hours,
          deliveryFee: Number(form.delivery_fee),
          minOrder: Number(form.min_order),
          currency: form.currency,
          bonusPercent: Number(form.bonus_percent),
          bonusRedeemAmount: Number(form.bonus_redeem_amount),
          supportPhone: form.support_phone,
          instagram: form.instagram,
          telegram: form.telegram,
          splashImageUrl: form.splash_image_url,
          splashTitleRu: form.splash_title_ru,
          splashTitleUz: form.splash_title_uz,
          splashSubtitleRu: form.splash_subtitle_ru,
          splashSubtitleUz: form.splash_subtitle_uz,
          splashShowOnce: form.splash_show_once === 1,
          catalogMode: "real",
          mobileApiKey: form.mobile_api_key,
          plumBaseUrl: form.plum_base_url,
          plumUsername: form.plum_username,
          plumPassword: form.plum_password,
          eskizEnabled: form.eskiz_enabled === 1,
          eskizEmail: form.eskiz_email,
          eskizPassword: form.eskiz_password,
          eskizFrom: form.eskiz_from,
          eskizCallbackUrl: form.eskiz_callback_url,
          cashierUsername: form.cashier_username,
          cashierPassword: form.cashier_password,
        }),
      }),
      fetch("/api/poster/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: poster.account_name,
          accessToken: poster.access_token,
          username: poster.username,
          password: poster.password,
          useToken: poster.use_token === 1,
          importCategories: poster.import_categories === 1,
          importProducts: poster.import_products === 1,
          importImages: poster.import_images === 1,
          autoSyncEnabled: poster.auto_sync_enabled === 1,
          autoSyncIntervalMinutes: poster.auto_sync_interval_minutes,
          webhookSecret: poster.webhook_secret,
          sendOrdersToPoster: poster.send_orders_to_poster === 1,
          orderSpotId: poster.order_spot_id,
        }),
      }),
    ]);
    setSaving(false);
    setMessage("Сохранено");
    load();
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage("");
    const response = await fetch("/api/poster/settings", { method: "POST" });
    const data = await response.json().catch(() => null);
    setTesting(false);
    setMessage(response.ok ? "Подключение к Poster успешно" : data?.error ?? "Ошибка подключения");
    load();
  };

  const runSync = async () => {
    setSyncing(true);
    setMessage("");
    const response = await fetch("/api/poster/sync", { method: "POST" });
    const data = await response.json().catch(() => null);
    setSyncing(false);
    setMessage(
      response.ok
        ? `Синхронизировано: ${data?.importedCategories ?? 0} категорий, ${data?.importedProducts ?? 0} товаров`
        : data?.error ?? "Ошибка синхронизации",
    );
    load();
  };

  const testPlumConnection = async () => {
    setTestingPlum(true);
    setMessage("");
    setPlumStatus({ ok: null, text: "Проверка..." });
    const response = await fetch("/api/plum/test", { method: "POST" });
    const data = await response.json().catch(() => null);
    setTestingPlum(false);
    setPlumStatus(
      response.ok
        ? {
            ok: true,
            text: `Подключено. Транзакций найдено: ${data?.totalTransactions ?? 0}`,
          }
        : {
            ok: false,
            text: data?.error ?? "Ошибка подключения к Plum",
          },
    );
    setMessage(
      response.ok
        ? `Подключение к Plum успешно. Доступ к API подтвержден. Транзакций найдено: ${data?.totalTransactions ?? 0}`
        : data?.error ?? "Ошибка подключения к Plum",
    );
  };

  const testEskizConnection = async () => {
    setTestingEskiz(true);
    setMessage("");
    const response = await fetch("/api/eskiz/test", { method: "POST" });
    const data = await response.json().catch(() => null);
    setTestingEskiz(false);
    setMessage(
      response.ok
        ? `Подключение к Eskiz успешно. Token: ${data?.tokenPreview ?? "ok"}`
        : data?.error ?? "Ошибка подключения к Eskiz",
    );
  };

  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error ?? `Upload failed (${response.status})`);
    }
    const data = await response.json();
    return data.url as string;
  };

  if (loading) {
    return <div className="text-sm text-[var(--muted)]">Загрузка...</div>;
  }

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Настройки"
        subtitle="Общие настройки приложения, public API и интеграция с Poster."
      />

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить"}
        </PrimaryButton>
        <GhostButton onClick={load}>Обновить</GhostButton>
      </div>

      {message ? (
        <div className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-semibold text-[var(--ink)]">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <SectionTitle title="Приложение" subtitle="Публичные данные для мобильного клиента." />
          <Field label="Название">
            <input value={form.cafe_name} onChange={(e) => setForm({ ...form, cafe_name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Телефон">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Адрес">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Часы работы">
            <input value={form.work_hours} onChange={(e) => setForm({ ...form, work_hours: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Доставка">
              <input type="number" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: Number(e.target.value) })} className={inputClass} />
            </Field>
            <Field label="Мин. заказ">
              <input type="number" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: Number(e.target.value) })} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Валюта">
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass} />
            </Field>
            <Field label="API key для мобилки">
              <input value={form.mobile_api_key} onChange={(e) => setForm({ ...form, mobile_api_key: e.target.value })} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Splash экран" subtitle="Показывается один раз при первом запуске." />
          <Field label="Картинка">
            <div className="space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCropSrc(reader.result as string);
                    setCropType(file.type || "image/jpeg");
                    setCropOpen(true);
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                }}
                className={inputClass}
              />
              {form.splash_image_url ? (
                <img
                  src={form.splash_image_url}
                  alt="Splash preview"
                  className="h-44 w-full rounded-2xl object-contain bg-white"
                />
              ) : null}
            </div>
          </Field>
          <Field label="Заголовок RU">
            <textarea
              value={form.splash_title_ru}
              onChange={(e) => setForm({ ...form, splash_title_ru: e.target.value })}
              rows={3}
              className={textareaClass}
            />
          </Field>
          <Field label="Заголовок UZ">
            <textarea
              value={form.splash_title_uz}
              onChange={(e) => setForm({ ...form, splash_title_uz: e.target.value })}
              rows={3}
              className={textareaClass}
            />
          </Field>
          <Field label="Подзаголовок RU">
            <textarea
              value={form.splash_subtitle_ru}
              onChange={(e) => setForm({ ...form, splash_subtitle_ru: e.target.value })}
              rows={2}
              className={textareaClass}
            />
          </Field>
          <Field label="Подзаголовок UZ">
            <textarea
              value={form.splash_subtitle_uz}
              onChange={(e) => setForm({ ...form, splash_subtitle_uz: e.target.value })}
              rows={2}
              className={textareaClass}
            />
          </Field>
          <SwitchRow
            label="Показывать только при первом запуске"
            checked={form.splash_show_once === 1}
            onChange={(checked) => setForm({ ...form, splash_show_once: checked ? 1 : 0 })}
          />
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Plum" subtitle="Оплата картой через PaymentWithoutRegistration и ConfirmPayment." />
          <Field label="Base URL">
            <input
              value={form.plum_base_url}
              onChange={(e) => setForm({ ...form, plum_base_url: e.target.value })}
              placeholder="https://pay.myuzcard.uz"
              className={inputClass}
            />
          </Field>
          <Field label="Логин Plum">
            <input
              value={form.plum_username}
              onChange={(e) => setForm({ ...form, plum_username: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Пароль Plum">
            <input
              type="password"
              value={form.plum_password}
              onChange={(e) => setForm({ ...form, plum_password: e.target.value })}
              className={inputClass}
            />
          </Field>
          <p className="text-xs text-[var(--muted)]">
            Эти данные используются серверными API `/api/public/payments/plum/start` и `/api/public/payments/plum/confirm`.
          </p>
          <div className="rounded-2xl bg-white p-4 text-sm">
            <p>
              <b>Статус:</b>{" "}
              {plumStatus.ok == null
                ? plumStatus.text
                : plumStatus.ok
                  ? "Подключено"
                  : "Ошибка"}
            </p>
            <p>
              <b>Результат:</b> {plumStatus.text}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={testPlumConnection} disabled={testingPlum}>
              {testingPlum ? "Проверка Plum..." : "Проверить Plum"}
            </PrimaryButton>
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Eskiz SMS" subtitle="SMS-уведомления клиентам через Eskiz." />
          <SwitchRow
            label="Включить Eskiz"
            checked={form.eskiz_enabled === 1}
            onChange={(checked) => setForm({ ...form, eskiz_enabled: checked ? 1 : 0 })}
          />
          <Field label="Email Eskiz">
            <input
              value={form.eskiz_email}
              onChange={(e) => setForm({ ...form, eskiz_email: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Пароль Eskiz">
            <input
              type="password"
              value={form.eskiz_password}
              onChange={(e) => setForm({ ...form, eskiz_password: e.target.value })}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Отправитель">
              <input
                value={form.eskiz_from}
                onChange={(e) => setForm({ ...form, eskiz_from: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Callback URL">
              <input
                value={form.eskiz_callback_url}
                onChange={(e) => setForm({ ...form, eskiz_callback_url: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Eskiz используется только для OTP-кода при регистрации нового аккаунта.
          </p>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={testEskizConnection} disabled={testingEskiz}>
              {testingEskiz ? "Проверка Eskiz..." : "Проверить Eskiz"}
            </PrimaryButton>
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Касса" subtitle="Отдельный логин для кассира. Вход через /cashier/login." />
          <Field label="Логин кассы">
            <input
              value={form.cashier_username}
              onChange={(e) => setForm({ ...form, cashier_username: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Пароль кассы">
            <input
              type="password"
              value={form.cashier_password}
              onChange={(e) => setForm({ ...form, cashier_password: e.target.value })}
              className={inputClass}
            />
          </Field>
          <p className="text-xs text-[var(--muted)]">
            Эти данные используются кассиром для входа и обработки заказов: принять, отклонить, отправить, завершить.
          </p>
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Poster" subtitle="Категории, товары и картинки подтягиваются из Poster." />
          <Field label="Аккаунт Poster">
            <input value={poster.account_name} onChange={(e) => setPoster({ ...poster, account_name: e.target.value })} placeholder="subdomain" className={inputClass} />
          </Field>
          <Field label="Token">
            <input value={poster.access_token} onChange={(e) => setPoster({ ...poster, access_token: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <SwitchRow
              label="Категории"
              checked={poster.import_categories === 1}
              onChange={(checked) => setPoster({ ...poster, import_categories: checked ? 1 : 0 })}
            />
            <SwitchRow
              label="Товары"
              checked={poster.import_products === 1}
              onChange={(checked) => setPoster({ ...poster, import_products: checked ? 1 : 0 })}
            />
            <SwitchRow
              label="Картинки"
              checked={poster.import_images === 1}
              onChange={(checked) => setPoster({ ...poster, import_images: checked ? 1 : 0 })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SwitchRow
              label="Авто-sync по таймеру"
              checked={poster.auto_sync_enabled === 1}
              onChange={(checked) => setPoster({ ...poster, auto_sync_enabled: checked ? 1 : 0 })}
            />
            <Field label="Интервал авто-sync, мин">
              <input
                type="number"
                min={1}
                value={poster.auto_sync_interval_minutes}
                onChange={(e) =>
                  setPoster({
                    ...poster,
                    auto_sync_interval_minutes: Number(e.target.value) || 30,
                  })
                }
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SwitchRow
              label="Отправлять заказы в Poster"
              checked={poster.send_orders_to_poster === 1}
              onChange={(checked) => setPoster({ ...poster, send_orders_to_poster: checked ? 1 : 0 })}
            />
            <Field label="Poster spot_id для заказов">
              <input
                value={poster.order_spot_id}
                onChange={(e) => setPoster({ ...poster, order_spot_id: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="rounded-2xl bg-white p-4 text-sm">
            <p><b>Статус:</b> {poster.is_connected ? "Подключено" : "Не подключено"}</p>
            <p><b>Последний sync:</b> {poster.last_sync_at || "—"}</p>
            <p><b>Результат:</b> {poster.last_sync_error || poster.last_sync_status || "—"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={testConnection} disabled={testing}>
              {testing ? "Проверка..." : "Проверить Poster"}
            </PrimaryButton>
            <PrimaryButton onClick={runSync} disabled={syncing}>
              {syncing ? "Синхронизация..." : "Синхронизировать"}
            </PrimaryButton>
          </div>
        </Card>
      </div>

      <ImageCropper
        open={cropOpen && Boolean(cropSrc)}
        imageSrc={cropSrc ?? ""}
        aspect={9 / 16}
        title="Обрезка splash"
        helperText="Обрежьте картинку так, как она будет видна на экране загрузки"
        targetWidth={1080}
        targetHeight={1920}
        maxWidth={1080}
        maxHeight={1920}
        outputType={cropType}
        onCancel={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        onConfirm={async (file) => {
          const url = await uploadImage(file);
          setForm((prev) => ({ ...prev, splash_image_url: url }));
          setCropOpen(false);
          setCropSrc(null);
        }}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--ink)]">{label}</span>
      {children}
    </label>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)] shadow-sm focus:border-[var(--brand)] focus:outline-none";

const textareaClass =
  "w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)] shadow-sm focus:border-[var(--brand)] focus:outline-none";
