"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "./ui";

const navItems = [
  { href: "/admin", label: "Обзор", icon: "🏠" },
  { href: "/admin/customers", label: "Клиенты", icon: "👥" },
  { href: "/admin/banners", label: "Баннеры", icon: "🖼️" },
  { href: "/admin/categories", label: "Категории", icon: "📚" },
  { href: "/admin/products", label: "Товары", icon: "🍔" },
  { href: "/admin/settings", label: "Настройки", icon: "⚙️" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [quickOpen, setQuickOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="grainy min-h-screen pb-32">
      <header className="sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <div className="glass flex items-center justify-between gap-3 rounded-[30px] border border-[var(--stroke)] px-4 py-4 shadow-[var(--shadow-soft)] sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Uzbur
              </p>
              <h1 className="truncate text-lg font-extrabold text-[var(--ink)] sm:text-xl">
                Админ-панель
              </h1>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => setQuickOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--stroke)] bg-white/90 text-xl font-bold text-[var(--ink)] shadow-sm transition hover:border-[var(--brand)] hover:bg-[var(--accent)]"
                aria-label="Быстрые действия"
              >
                +
              </button>
              <button
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--stroke)] bg-white/90 text-base font-bold text-[var(--ink)] shadow-sm transition hover:border-[var(--brand)] hover:bg-[var(--accent)]"
                aria-label="Выйти"
              >
                ↗
              </button>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <button
                onClick={() => setQuickOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--stroke)] bg-white text-xl font-bold text-[var(--ink)] shadow-sm transition hover:-translate-y-[1px] hover:border-[var(--brand)] hover:bg-[var(--accent)]"
              >
                +
              </button>
              <button
                onClick={logout}
                className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-bold text-[var(--ink)] shadow-sm transition hover:-translate-y-[1px] hover:border-[var(--brand)]"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <nav className="glass fixed bottom-3 left-1/2 z-20 w-[min(94vw,760px)] -translate-x-1/2 rounded-[30px] border border-[var(--stroke)] p-2 shadow-[var(--shadow)]">
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-[10px] font-semibold transition sm:px-2 sm:text-xs ${
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                    : "text-[var(--muted)] hover:bg-[var(--accent)]"
                }`}
              >
                <span className="text-base sm:text-lg">{item.icon}</span>
                <span className="leading-tight text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Что добавить?"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "Товар", subtitle: "Ручное создание", icon: "🍔", href: "/admin/products" },
            { title: "Клиент", subtitle: "База клиентов", icon: "👥", href: "/admin/customers" },
            { title: "Категория", subtitle: "Разделы меню", icon: "📚", href: "/admin/categories" },
            { title: "Баннер", subtitle: "Главный экран", icon: "🖼️", href: "/admin/banners" },
          ].map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setQuickOpen(false);
                router.push(item.href);
              }}
              className="group flex flex-col gap-3 rounded-3xl border border-[var(--stroke)] bg-white/95 p-5 text-left shadow-sm transition hover:-translate-y-[2px] hover:border-[var(--brand)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl">
                {item.icon}
              </div>
              <div>
                <p className="text-base font-bold text-[var(--ink)]">{item.title}</p>
                <p className="text-sm text-[var(--muted)]">{item.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
