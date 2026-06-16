"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Card,
  GhostButton,
  Modal,
  PrimaryButton,
  SectionTitle,
} from "../_components/ui";

type Customer = {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  notes: string;
  bonus_balance: number;
  total_spent: number;
  total_orders: number;
  is_active: number;
  created_at: string;
  last_order_at?: string | null;
};

type CustomerOrder = {
  id: number;
  external_id: string | null;
  status: string;
  total: number;
  delivery_fee: number;
  created_at: string;
  address_text: string;
  items: Array<{
    title: string;
    price: number;
    quantity: number;
    total: number;
  }>;
};

const initialForm = {
  fullName: "",
  phone: "",
  email: "",
  notes: "",
  bonusBalance: 0,
  totalSpent: 0,
  totalOrders: 0,
  isActive: true,
};

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<CustomerOrder[]>([]);
  const [form, setForm] = useState(initialForm);

  const load = () => {
    setLoading(true);
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filteredItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return items;
    return items.filter((item) =>
      [item.full_name, item.phone, item.email]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [items, query]);

  const resetForm = () => {
    setEditingId(null);
    setError(null);
    setForm(initialForm);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);

    const payload = {
      fullName: form.fullName,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      bonusBalance: Number(form.bonusBalance),
      totalSpent: Number(form.totalSpent),
      totalOrders: Number(form.totalOrders),
      isActive: form.isActive,
    };

    const response = editingId
      ? await fetch(`/api/customers/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Не удалось сохранить клиента");
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    resetForm();
    load();
  };

  const startCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const startEdit = (item: Customer) => {
    setEditingId(item.id);
    setError(null);
    setForm({
      fullName: item.full_name,
      phone: item.phone,
      email: item.email ?? "",
      notes: item.notes ?? "",
      bonusBalance: item.bonus_balance ?? 0,
      totalSpent: item.total_spent ?? 0,
      totalOrders: item.total_orders ?? 0,
      isActive: item.is_active === 1,
    });
    setModalOpen(true);
  };

  const remove = async (id: number) => {
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    load();
  };

  const openHistory = async (item: Customer) => {
    setHistoryCustomer(item);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const response = await fetch(`/api/customers/${item.id}/orders`);
    const data = await response.json().catch(() => null);
    setHistoryItems(data?.items ?? []);
    setHistoryLoading(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle title="Клиенты" subtitle="Список клиентов и ручное создание." />
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
            className="h-10 w-56 rounded-2xl border border-[var(--stroke)] bg-white px-3 text-sm"
          />
          <PrimaryButton onClick={startCreate}>Добавить</PrimaryButton>
        </div>
      </div>

      {error ? (
        <Card className="border-[var(--danger)] bg-red-50/80 text-sm font-semibold text-red-700">
          {error}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <Card>Загрузка...</Card>
        ) : filteredItems.length === 0 ? (
          <Card>Клиентов пока нет.</Card>
        ) : (
          filteredItems.map((item) => (
            <Card key={item.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-[var(--ink)]">
                    {item.full_name}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.phone}</p>
                  {item.email ? (
                    <p className="truncate text-sm text-[var(--muted)]">{item.email}</p>
                  ) : null}
                  {item.last_order_at ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Последний заказ: {formatDate(item.last_order_at)}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    item.is_active === 1
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {item.is_active === 1 ? "Активен" : "Скрыт"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Заказы" value={String(item.total_orders ?? 0)} />
                <MiniStat label="Потратил" value={formatMoney(item.total_spent ?? 0)} />
                <MiniStat label="Бонусы" value={formatMoney(item.bonus_balance ?? 0)} />
              </div>

              {item.notes ? (
                <p className="rounded-2xl bg-white/90 px-4 py-3 text-sm text-[var(--muted)]">
                  {item.notes}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={() => openHistory(item)}>Заказы</GhostButton>
                <GhostButton onClick={() => startEdit(item)}>Редактировать</GhostButton>
                <GhostButton onClick={() => remove(item.id)}>Удалить</GhostButton>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingId ? "Редактировать клиента" : "Новый клиент"}
        footer={
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={submit} disabled={saving}>
              {saving ? "Сохранение..." : editingId ? "Сохранить" : "Создать"}
            </PrimaryButton>
            <GhostButton onClick={resetForm}>Очистить</GhostButton>
          </div>
        }
      >
        {error ? (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Имя">
            <input
              value={form.fullName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Телефон">
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Email">
            <input
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Бонусы">
            <input
              type="number"
              value={form.bonusBalance}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  bonusBalance: Number(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Потратил">
            <input
              type="number"
              value={form.totalSpent}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  totalSpent: Number(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Заказов">
            <input
              type="number"
              value={form.totalOrders}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  totalOrders: Number(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
            />
          </Field>
        </div>

        <Field label="Комментарий">
          <textarea
            rows={4}
            value={form.notes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notes: event.target.value }))
            }
            className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm"
          />
        </Field>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, isActive: event.target.checked }))
            }
          />
          Активен
        </label>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryCustomer(null);
          setHistoryItems([]);
        }}
        title={historyCustomer ? `Заказы: ${historyCustomer.full_name}` : "Заказы"}
      >
        {historyLoading ? (
          <p className="text-sm text-[var(--muted)]">Загрузка...</p>
        ) : historyItems.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">У клиента пока нет заказов.</p>
        ) : (
          <div className="space-y-4">
            {historyItems.map((order) => (
              <div key={order.id} className="rounded-3xl bg-white/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {order.external_id || `#${order.id}`}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--ink)]">{formatMoney(order.total)}</p>
                    <p className="text-xs text-[var(--muted)]">{order.status}</p>
                  </div>
                </div>
                {order.address_text ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">{order.address_text}</p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {order.items.map((item, index) => (
                    <div
                      key={`${order.id}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-2xl bg-[var(--accent)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {item.title}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{item.quantity} шт.</p>
                      </div>
                      <p className="text-sm font-bold text-[var(--ink)]">
                        {formatMoney(item.total)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
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
    <label className="block text-sm font-semibold text-[var(--ink)]">
      {label}
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/90 p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value) + " сум";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
