import { requireAdmin } from "@/lib/auth";
import AdminShell from "./_components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
