import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type PeriodMetrics = {
  orders: number;
  revenue: number;
  avgTicket: number;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfMonth.getDate() - 29);

  const getPeriodMetrics = db.prepare(`
    SELECT
      COUNT(1) as orders,
      COALESCE(SUM(total), 0) as revenue,
      COALESCE(AVG(total), 0) as avgTicket
    FROM orders
    WHERE created_at >= ?
      AND status != 'cancelled'
  `);

  const mapPeriod = (value: unknown): PeriodMetrics => {
    const row = value as
      | { orders?: number; revenue?: number; avgTicket?: number }
      | undefined;
    return {
      orders: Number(row?.orders ?? 0),
      revenue: Number(row?.revenue ?? 0),
      avgTicket: Math.round(Number(row?.avgTicket ?? 0)),
    };
  };

  const today = mapPeriod(getPeriodMetrics.get(startOfToday.toISOString()));
  const week = mapPeriod(getPeriodMetrics.get(startOfWeek.toISOString()));
  const month = mapPeriod(getPeriodMetrics.get(startOfMonth.toISOString()));

  const topProducts = db.prepare(`
    SELECT
      oi.title as title,
      SUM(oi.quantity) as quantity,
      SUM(oi.total) as revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ?
      AND o.status != 'cancelled'
    GROUP BY oi.title
    HAVING SUM(oi.quantity) > 0
    ORDER BY quantity DESC, revenue DESC, title ASC
    LIMIT 5
  `).all(startOfMonth.toISOString()) as Array<{
    title: string;
    quantity: number;
    revenue: number;
  }>;

  const lowProducts = db.prepare(`
    SELECT
      oi.title as title,
      SUM(oi.quantity) as quantity,
      SUM(oi.total) as revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ?
      AND o.status != 'cancelled'
    GROUP BY oi.title
    HAVING SUM(oi.quantity) > 0
    ORDER BY quantity ASC, revenue ASC, title ASC
    LIMIT 5
  `).all(startOfMonth.toISOString()) as Array<{
    title: string;
    quantity: number;
    revenue: number;
  }>;

  const trendRows = db.prepare(`
    SELECT
      substr(created_at, 1, 10) as day,
      COUNT(1) as orders,
      COALESCE(SUM(total), 0) as revenue
    FROM orders
    WHERE created_at >= ?
      AND status != 'cancelled'
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day ASC
  `).all(startOfWeek.toISOString()) as Array<{
    day: string;
    orders: number;
    revenue: number;
  }>;

  return NextResponse.json({
    today,
    week,
    month,
    topProducts: topProducts.map((item) => ({
      title: item.title,
      quantity: Number(item.quantity ?? 0),
      revenue: Number(item.revenue ?? 0),
    })),
    lowProducts: lowProducts.map((item) => ({
      title: item.title,
      quantity: Number(item.quantity ?? 0),
      revenue: Number(item.revenue ?? 0),
    })),
    trend: trendRows.map((item) => ({
      day: item.day,
      orders: Number(item.orders ?? 0),
      revenue: Number(item.revenue ?? 0),
    })),
  });
}
