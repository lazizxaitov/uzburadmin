import CashierDashboard from "./_components/cashier-dashboard";

import { requireCashier } from "@/lib/auth";

export default async function CashierPage() {
  await requireCashier();
  return <CashierDashboard />;
}
