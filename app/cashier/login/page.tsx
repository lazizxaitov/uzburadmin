"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CashierLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/cashier-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      setLoading(false);
      setError("Неверный логин или пароль кассира.");
      return;
    }

    router.push("/cashier");
  };

  return (
    <div className="grainy min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center">
        <div className="mb-6 text-center sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            Uzbur
          </p>
          <h1 className="mt-3 text-4xl font-extrabold text-[var(--ink)]">
            Касса
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Отдельный вход для кассира и обработки заказов.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="glass rounded-[32px] border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
        >
          <label className="mb-4 block text-sm font-semibold text-[var(--ink)]">
            Логин кассы
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white/95 px-4 py-3 text-base font-medium text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[rgba(182,141,95,0.12)]"
              placeholder="Введите логин"
            />
          </label>
          <label className="mb-5 block text-sm font-semibold text-[var(--ink)]">
            Пароль
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white/95 px-4 py-3 text-base font-medium text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[rgba(182,141,95,0.12)]"
              placeholder="Введите пароль"
            />
          </label>

          {error ? (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[var(--brand-strong)] px-5 py-3 text-base font-bold text-white shadow-[var(--shadow-soft)] transition hover:translate-y-[-1px] hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Входим..." : "Войти в кассу"}
          </button>

          <Link
            href="/login"
            className="mt-3 block w-full rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 text-center text-base font-bold text-[var(--ink)] shadow-sm"
          >
            Войти как админ
          </Link>
        </form>
      </div>
    </div>
  );
}
