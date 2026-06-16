"use client";

import { useEffect, useState } from "react";

import { Card, SectionTitle } from "./_components/ui";

type Stats = {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  topProducts: ProductStats[];
  lowProducts: ProductStats[];
  trend: TrendPoint[];
};

type PeriodStats = {
  orders: number;
  revenue: number;
  avgTicket: number;
};

type ProductStats = {
  title: string;
  quantity: number;
  revenue: number;
};

type TrendPoint = {
  day: string;
  orders: number;
  revenue: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Обзор"
        subtitle="Продажи за день, неделю и месяц."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <PeriodCard title="Сегодня" stats={stats?.today} />
        </Card>
        <Card>
          <PeriodCard title="7 дней" stats={stats?.week} />
        </Card>
        <Card>
          <PeriodCard title="30 дней" stats={stats?.month} />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle
            title="Продается лучше"
            subtitle="Топ позиций за 30 дней."
          />
          <ProductsList items={stats?.topProducts ?? []} emptyText="Нет продаж за месяц." />
        </Card>
        <Card>
          <SectionTitle
            title="Продается хуже"
            subtitle="Позиции с самым низким спросом за 30 дней."
          />
          <ProductsList items={stats?.lowProducts ?? []} emptyText="Нет данных для сравнения." />
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="По дням"
          subtitle="Выручка и количество заказов за последние 7 дней."
        />
        <TrendList items={stats?.trend ?? []} />
      </Card>
    </div>
  );
}

function PeriodCard({ title, stats }: { title: string; stats: PeriodStats | undefined }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {title}
      </p>
      <div>
        <p className="text-3xl font-extrabold text-[var(--ink)]">
          {formatMoney(stats?.revenue ?? 0)}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">Выручка</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Заказов" value={String(stats?.orders ?? 0)} />
        <Metric label="Средний чек" value={formatMoney(stats?.avgTicket ?? 0)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/90 p-4">
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-extrabold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function ProductsList({
  items,
  emptyText,
}: {
  items: ProductStats[];
  emptyText: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="flex items-start justify-between gap-4 rounded-2xl bg-white/90 p-4"
        >
          <div className="min-w-0">
            <p className="truncate font-bold text-[var(--ink)]">{item.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.quantity} шт.</p>
          </div>
          <p className="text-right text-sm font-bold text-[var(--ink)]">
            {formatMoney(item.revenue)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrendList({ items }: { items: TrendPoint[] }) {
  if (!items.length) {
    return <p className="text-sm text-[var(--muted)]">Нет продаж за последние 7 дней.</p>;
  }

  const maxRevenue = Math.max(...items.map((item) => item.revenue), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const width = Math.max((item.revenue / maxRevenue) * 100, item.revenue > 0 ? 10 : 0);
        return (
          <div key={item.day} className="rounded-2xl bg-white/90 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold text-[var(--ink)]">{formatDay(item.day)}</p>
              <div className="text-right">
                <p className="font-bold text-[var(--ink)]">{formatMoney(item.revenue)}</p>
                <p className="text-xs text-[var(--muted)]">{item.orders} заказов</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--accent)]">
              <div
                className="h-full rounded-full bg-[var(--brand)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value) + " сум";
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
