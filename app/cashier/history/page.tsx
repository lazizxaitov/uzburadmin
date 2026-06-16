import CashierHistory from "../_components/cashier-history";

import { requireCashier } from "@/lib/auth";

export default async function CashierHistoryPage() {
  await requireCashier();
  return <CashierHistory />;
}
