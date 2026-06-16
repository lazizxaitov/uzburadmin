"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type OrderItem = {
  order_id: number;
  product_id: number | null;
  title: string;
  price: number;
  quantity: number;
  total: number;
};

type Order = {
  id: number;
  external_id: string | null;
  customer_name: string;
  customer_phone: string;
  status: string;
  address_text: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  bonus_earned: number;
  payment_method: string | null;
  payment_provider: string | null;
  payment_status: string | null;
  payment_card_mask: string | null;
  poster_incoming_order_id: string | null;
  poster_transaction_id: string | null;
  poster_sync_status: string | null;
  poster_sync_error: string | null;
  accepted_at: string | null;
  on_way_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
};

const statusLabels: Record<string, string> = {
  new: "Новый",
  accepted: "Принят",
  on_way: "В пути",
  delivered: "Доставлен",
  canceled: "Отклонен",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value) + " сум";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PosterSyncBadge({
  status,
  error,
}: {
  status: string | null;
  error: string | null;
}) {
  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
        Отправлено в Poster
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
        Не отправлено в Poster{error ? `: ${error}` : ""}
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
        Poster выключен
      </div>
    );
  }

  return null;
}

export default function CashierDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const load = async (preserveLoading = false) => {
    if (!preserveLoading) {
      setLoading(true);
    }
    const response = await fetch("/api/cashier/orders", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/cashier/login");
      return;
    }
    const data = await response.json().catch(() => null);
    setOrders(data?.items ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      load(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const activeOrders = useMemo(
    () => orders.filter((item) => item.status !== "delivered" && item.status !== "canceled"),
    [orders]
  );

  const logout = async () => {
    await fetch("/api/auth/cashier-logout", { method: "POST" });
    router.push("/cashier/login");
  };

  const updateStatus = async (orderId: number, status: string, reason = "") => {
    setBusyId(orderId);
    const response = await fetch(`/api/cashier/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, cancelReason: reason }),
    });
    setBusyId(null);
    if (response.ok) {
      setRejecting(null);
      setCancelReason("");
      load(true);
    }
  };

  return (
    <div className="min-h-screen grainy px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Uzbur
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-[var(--ink)]">Касса</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Новые заказы, подтверждение и отклонение в одном окне.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/cashier/history"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink)] shadow-sm transition hover:-translate-y-[1px] hover:border-[var(--brand)]"
            >
              История
            </Link>
            <button
              onClick={() => load()}
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink)] shadow-sm transition hover:-translate-y-[1px] hover:border-[var(--brand)]"
            >
              Обновить
            </button>
            <button
              onClick={logout}
              className="rounded-2xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)]"
            >
              Выйти
            </button>
          </div>
        </header>

        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-[var(--muted)]">
            <span>Активных заказов: {activeOrders.length}</span>
            <span>Всего заказов: {orders.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)] shadow-[var(--shadow)]">
            Загрузка заказов...
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)] shadow-[var(--shadow)]">
            Активных заказов нет.
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {activeOrders.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                      Заказ #{order.id}
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold text-[var(--ink)]">
                      {statusLabels[order.status] ?? order.status}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Создан: {formatDate(order.created_at)}
                    </p>
                    <div className="mt-3">
                      <PosterSyncBadge
                        status={order.poster_sync_status}
                        error={order.poster_sync_error}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                      Итого
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-[var(--ink)]">
                      {formatMoney(order.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <InfoBlock title="Клиент" value={order.customer_name || "Без имени"} />
                  <InfoBlock title="Телефон" value={order.customer_phone || "—"} />
                  <InfoBlock title="Адрес" value={order.address_text || "Самовывоз"} className="md:col-span-2" />
                  <InfoBlock
                    title="Оплата"
                    value={[
                      order.payment_method || "—",
                      order.payment_provider || "",
                      order.payment_card_mask || "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                  <InfoBlock title="Доставка" value={formatMoney(order.delivery_fee || 0)} />
                </div>

                <div className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
                  <p className="text-sm font-extrabold text-[var(--ink)]">Состав заказа</p>
                  <div className="mt-3 space-y-3">
                    {order.items.map((item, index) => (
                      <div
                        key={`${order.id}-${index}`}
                        className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] pb-3 last:border-b-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-bold text-[var(--ink)]">{item.title}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {item.quantity} × {formatMoney(item.price)}
                          </p>
                        </div>
                        <p className="text-sm font-extrabold text-[var(--ink)]">
                          {formatMoney(item.total)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {order.status === "new" ? (
                    <>
                      <button
                        onClick={() => updateStatus(order.id, "accepted")}
                        disabled={busyId === order.id}
                        className="rounded-2xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)] disabled:opacity-60"
                      >
                        Принять
                      </button>
                      <button
                        onClick={() => setRejecting(order)}
                        disabled={busyId === order.id}
                        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-60"
                      >
                        Отклонить
                      </button>
                    </>
                  ) : null}
                  {order.status === "accepted" ? (
                    <button
                      onClick={() => updateStatus(order.id, "on_way")}
                      disabled={busyId === order.id}
                      className="rounded-2xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)] disabled:opacity-60"
                    >
                      Передать в доставку
                    </button>
                  ) : null}
                  {order.status === "on_way" ? (
                    <button
                      onClick={() => updateStatus(order.id, "delivered")}
                      disabled={busyId === order.id}
                      className="rounded-2xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)] disabled:opacity-60"
                    >
                      Завершить заказ
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
            <h3 className="text-2xl font-extrabold text-[var(--ink)]">
              Отклонить заказ #{rejecting.id}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Укажите причину, чтобы она сохранилась в заказе.
            </p>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
              placeholder="Причина отклонения"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => updateStatus(rejecting.id, "canceled", cancelReason)}
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
              >
                Подтвердить
              </button>
              <button
                onClick={() => {
                  setRejecting(null);
                  setCancelReason("");
                }}
                className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink)]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({
  title,
  value,
  className = "",
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white px-4 py-3 shadow-sm ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-2 text-sm font-bold text-[var(--ink)]">{value || "—"}</p>
    </div>
  );
}
