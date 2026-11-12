"use client";

import { useState } from "react";

type ProductOption = { id: number; title_ru: string };

/** Выбор нескольких товаров: поиск, галочки и список выбранных в порядке показа. */
export default function ProductMultiPicker({
  products,
  value,
  onChange,
}: {
  products: ProductOption[];
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(products.map((product) => [product.id, product]));
  const normalized = query.trim().toLowerCase();
  const filtered = products.filter(
    (product) => !normalized || product.title_ru.toLowerCase().includes(normalized),
  );

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="text-sm font-semibold md:col-span-2">
      Товары акции
      <span className="ml-2 font-normal text-[var(--muted)]">выбрано: {value.length}</span>

      {value.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((id, index) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full border border-[var(--stroke)] bg-white py-1 pl-3 pr-1 text-xs font-semibold"
            >
              <span className="text-[var(--muted)]">{index + 1}.</span>
              {byId.get(id)?.title_ru ?? `Товар #${id}`}
              <button
                type="button"
                onClick={() => move(index, -1)}
                className="rounded-full px-1 text-[var(--muted)] hover:text-[var(--ink)]"
                title="Левее"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                className="rounded-full px-1 text-[var(--muted)] hover:text-[var(--ink)]"
                title="Правее"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="rounded-full px-1.5 font-bold text-[var(--danger)]"
                title="Убрать"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск товара"
        className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink)]"
      />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-3 text-xs font-normal text-[var(--muted)]">Ничего не найдено</p>
        ) : (
          filtered.map((product) => (
            <label
              key={product.id}
              className="flex cursor-pointer items-center gap-3 border-b border-[var(--stroke)] px-4 py-2 text-sm font-medium last:border-b-0 hover:bg-[var(--accent)]"
            >
              <input
                type="checkbox"
                checked={value.includes(product.id)}
                onChange={() => toggle(product.id)}
                className="h-4 w-4"
              />
              {product.title_ru}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
