"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type OrderItem = {
  title: string;
  price: number;
  quantity: number;
  total: number;
};

type Order = {
  id: number;
  customer_name: string;
  customer_phone: string;
  status: string;
  address_text: string;
  total: number;
  payment_method: string | null;
  poster_sync_status: string | null;
  poster_sync_error: string | null;
  created_at: string;
  delivered_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  items: OrderItem[];
};

const statusLabels: Record<string, string> = {
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
    year: "numeric",
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

export default function CashierHistory() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    setLoading(true);
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
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders
      .filter((item) => item.status === "delivered" || item.status === "canceled")
      .filter((item) => (status === "all" ? true : item.status === status))
      .filter((item) => {
        if (!normalized) return true;
        return `${item.id} ${item.customer_name} ${item.customer_phone}`
          .toLowerCase()
          .includes(normalized);
      });
  }, [orders, query, status]);

  return (
    <div className="min-h-screen grainy px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Uzbur
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-[var(--ink)]">История кассы</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/cashier"
              className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink)] shadow-sm"
            >
              Активные заказы
            </Link>
            <button
              onClick={load}
              className="rounded-2xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)]"
            >
              Обновить
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по номеру, имени, телефону"
            className="h-12 min-w-[260px] flex-1 rounded-2xl border border-[var(--stroke)] bg-white px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-12 rounded-2xl border border-[var(--stroke)] bg-white px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
          >
            <option value="all">Все</option>
            <option value="delivered">Доставлен</option>
            <option value="canceled">Отклонен</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)] shadow-[var(--shadow)]">
            Загрузка истории...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)] shadow-[var(--shadow)]">
            История заказов пуста.
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {filtered.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
              >
                <div className="flex items-start justify-between gap-3">
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
                  <p className="text-xl font-extrabold text-[var(--ink)]">
                    {formatMoney(order.total)}
                  </p>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--ink)]">
                  <p><b>Клиент:</b> {order.customer_name || "Без имени"}</p>
                  <p><b>Телефон:</b> {order.customer_phone || "—"}</p>
                  <p><b>Адрес:</b> {order.address_text || "Самовывоз"}</p>
                  <p><b>Оплата:</b> {order.payment_method || "—"}</p>
                  {order.status === "delivered" ? (
                    <p><b>Доставлен:</b> {formatDate(order.delivered_at)}</p>
                  ) : null}
                  {order.status === "canceled" ? (
                    <>
                      <p><b>Отклонен:</b> {formatDate(order.canceled_at)}</p>
                      <p><b>Причина:</b> {order.cancel_reason || "Не указана"}</p>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
