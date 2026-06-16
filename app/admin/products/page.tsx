"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  Card,
  PrimaryButton,
  GhostButton,
  Modal,
} from "../_components/ui";
import ImageCropper from "../_components/image-cropper";

type Category = {
  id: number;
  name_ru: string;
  name_uz: string;
};

type PortionOption = {
  labelRu: string;
  labelUz: string;
  price: number;
};

type Product = {
  id: number;
  title_ru: string;
  title_uz: string;
  price: number;
  price_text_ru?: string | null;
  price_text_uz?: string | null;
  category_id?: number | null;
  category_name_ru?: string | null;
  category_name_uz?: string | null;
  description_title_ru?: string | null;
  description_title_uz?: string | null;
  description_text_ru?: string | null;
  description_text_uz?: string | null;
  pricing_mode: "quantity" | "portion";
  stock: number;
  is_active: number;
  images: string[];
  portionOptions: Array<{
    label_ru: string;
    label_uz: string;
    price: number;
  }>;
};

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [form, setForm] = useState({
    titleRu: "",
    titleUz: "",
    categoryId: "",
    price: "",
    descriptionTitleRu: "",
    descriptionTitleUz: "",
    descriptionTextRu: "",
    descriptionTextUz: "",
    pricingMode: "quantity" as "quantity" | "portion",
    stock: 0,
    isActive: true,
    images: [] as string[],
    portionOptions: [] as PortionOption[],
  });

  const load = () => {
    setLoading(true);
    Promise.all([fetch("/api/products"), fetch("/api/categories")])
      .then(async ([productsRes, categoriesRes]) => {
        const products = await productsRes.json();
        const cats = await categoriesRes.json();
        setItems(products.items ?? []);
        setCategories(cats.items ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setError(null);
    setForm({
      titleRu: "",
      titleUz: "",
      categoryId: "",
      price: "",
      descriptionTitleRu: "",
      descriptionTitleUz: "",
      descriptionTextRu: "",
      descriptionTextUz: "",
      pricingMode: "quantity",
      stock: 0,
      isActive: true,
      images: [],
      portionOptions: [],
    });
    setCategoryOpen(false);
    setCategoryQuery("");
  };

  const startEdit = (item: Product) => {
    setEditingId(item.id);
    setModalOpen(true);
    setForm({
      titleRu: item.title_ru,
      titleUz: item.title_uz,
      categoryId: item.category_id ? String(item.category_id) : "",
      price: String(item.price),
      descriptionTitleRu: item.description_title_ru ?? "",
      descriptionTitleUz: item.description_title_uz ?? "",
      descriptionTextRu: item.description_text_ru ?? "",
      descriptionTextUz: item.description_text_uz ?? "",
      pricingMode: item.pricing_mode,
      stock: item.stock,
      isActive: item.is_active === 1,
      images: item.images ?? [],
      portionOptions:
        item.portionOptions?.map((option) => ({
          labelRu: option.label_ru,
          labelUz: option.label_uz,
          price: option.price,
        })) ?? [],
    });
    setCategoryOpen(false);
    setCategoryQuery("");
  };

  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error ?? `Upload failed (${response.status})`;
      throw new Error(message);
    }
    const data = await response.json();
    return data.url as string;
  };

  const loadCropFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const startCropQueue = (files: File[]) => {
    if (!files.length) return;
    setCropQueue(files);
    loadCropFile(files[0]);
  };

  const handleCropConfirm = async (file: File) => {
    const url = await uploadImage(file);
    setForm((prev) => ({ ...prev, images: [...prev.images, url] }));
    const remaining = cropQueue.slice(1);
    setCropQueue(remaining);
    if (remaining.length > 0) {
      loadCropFile(remaining[0]);
    } else {
      setCropOpen(false);
      setCropSrc(null);
    }
  };

  const handleCropCancel = () => {
    setCropOpen(false);
    setCropSrc(null);
    setCropQueue([]);
  };

  const productAspect = 176 / 146;

  const submit = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      titleRu: form.titleRu,
      titleUz: form.titleUz,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      price: Number(form.price || 0),
      priceTextRu: null,
      priceTextUz: null,
      descriptionTitleRu: form.descriptionTitleRu || null,
      descriptionTitleUz: form.descriptionTitleUz || null,
      descriptionTextRu: form.descriptionTextRu || null,
      descriptionTextUz: form.descriptionTextUz || null,
      pricingMode: form.pricingMode,
      stock: Number(form.stock),
      isActive: form.isActive,
      images: form.images,
      portionOptions: form.portionOptions,
    };

    const response = editingId
      ? await fetch(`/api/products/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Не удалось сохранить товар");
      setSaving(false);
      return;
    }

    resetForm();
    setModalOpen(false);
    load();
    setSaving(false);
  };

  const remove = async (id: number) => {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  };

  const selectedCategory = categories.find(
    (cat) => String(cat.id) === form.categoryId
  );
  const selectedFilterCategory = categories.find(
    (cat) => String(cat.id) === filterCategoryId
  );
  const filteredCategories = categories.filter((cat) => {
    const query = categoryQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      cat.name_ru.toLowerCase().includes(query) ||
      cat.name_uz.toLowerCase().includes(query)
    );
  });
  const filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      item.title_ru.toLowerCase().includes(query) ||
      item.title_uz.toLowerCase().includes(query) ||
      (item.category_name_ru ?? "").toLowerCase().includes(query) ||
      (item.category_name_uz ?? "").toLowerCase().includes(query);
    const matchesCategory =
      filterCategoryId === "all" ||
      String(item.category_id ?? "") === filterCategoryId;
    return matchesQuery && matchesCategory;
  });
  const filteredFilterCategories = categories.filter((cat) => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      cat.name_ru.toLowerCase().includes(query) ||
      cat.name_uz.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[var(--ink)]">
            {"\u0422\u043e\u0432\u0430\u0440\u044b"}
          </h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            {"\u041f\u043e\u043b\u043d\u044b\u0439 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u0441 \u0446\u0435\u043d\u0430\u043c\u0438, \u043e\u0441\u0442\u0430\u0442\u043a\u0430\u043c\u0438 \u0438 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430\u043c\u0438."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={"\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e"}
              className="h-9 w-52 rounded-2xl border border-[var(--stroke)] bg-white px-3 text-xs"
            />
            <GhostButton onClick={() => setSearchQuery("")}>
              {"\u041f\u043e\u0438\u0441\u043a"}
            </GhostButton>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((prev) => !prev)}
              className="mt-1 flex h-9 w-[300px] items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white px-3 text-xs font-semibold text-[var(--ink)]"
            >
              <span>
                {filterCategoryId === "all"
                  ? "\u0412\u0441\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438"
                  : selectedFilterCategory?.name_ru ?? "\u0412\u0441\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438"}
              </span>
              <span className="text-sm">{"\u25be"}</span>
            </button>

            {filterOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-[300px] overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
                <div className="p-3">
                  <input
                    value={filterQuery}
                    onChange={(event) => setFilterQuery(event.target.value)}
                    placeholder={"\u041f\u043e\u0438\u0441\u043a \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438..."}
                    className="w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterCategoryId("all");
                      setFilterOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-xs hover:bg-[var(--accent)]"
                  >
                    <span>{"\u0412\u0441\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438"}</span>
                  </button>
                  {filteredFilterCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFilterCategoryId(String(cat.id));
                        setFilterOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-xs hover:bg-[var(--accent)]"
                    >
                      <span>{cat.name_ru}</span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {cat.name_uz}
                      </span>
                    </button>
                  ))}
                  {filteredFilterCategories.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[var(--muted)]">
                      {"\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--ink)]">Список товаров</h3>
          <p className="text-sm text-[var(--muted)]">
            Добавляйте и редактируйте товары через модальное окно.
          </p>
        </div>
        <PrimaryButton
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
        >
          Добавить
        </PrimaryButton>
      </Card>

      {error ? (
        <Card className="border-[var(--danger)] bg-red-50/80 text-sm font-semibold text-red-700">
          {error}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <Card>Загрузка...</Card>
        ) : filteredItems.length === 0 ? (
          <Card>Пока нет товаров.</Card>
        ) : (
          filteredItems.map((item) => (
            <Card key={item.id} className="flex flex-col gap-4">
              {item.images?.[0] ? (
                <Image
                  src={item.images[0]}
                  alt={item.title_ru}
                  unoptimized
                  className="h-36 w-full rounded-2xl object-cover"
                  width={1200}
                  height={720}
                />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[var(--ink)]">
                    {item.title_ru}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.title_uz}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                    {item.price.toLocaleString("ru-RU")} сум
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Категория: {item.category_name_ru ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Остаток: {item.stock} · {item.is_active ? "Активен" : "Скрыт"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <GhostButton onClick={() => startEdit(item)}>Ред.</GhostButton>
                  <GhostButton onClick={() => remove(item.id)}>Удал.</GhostButton>
                </div>
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
        title={editingId ? "Редактировать товар" : "Новый товар"}
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
          <label className="text-sm font-semibold">
            Название (RU)
            <input
              value={form.titleRu}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, titleRu: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Название (UZ)
            <input
              value={form.titleUz}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, titleUz: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="text-sm font-semibold">
            Категория
            <div className="relative mt-2">
              <button
                type="button"
                onClick={() => setCategoryOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-left text-sm font-medium text-[var(--ink)]"
              >
                <span>
                  {selectedCategory
                    ? selectedCategory.name_ru
                    : "Без категории"}
                </span>
                <span className="text-base">▾</span>
              </button>

              {categoryOpen ? (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
                  <div className="p-3">
                    <input
                      value={categoryQuery}
                      onChange={(event) => setCategoryQuery(event.target.value)}
                      placeholder="Поиск категории..."
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, categoryId: "" }));
                        setCategoryOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--accent)]"
                    >
                      <span>Без категории</span>
                    </button>
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            categoryId: String(cat.id),
                          }));
                          setCategoryOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--accent)]"
                      >
                        <span>{cat.name_ru}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {cat.name_uz}
                        </span>
                      </button>
                    ))}
                    {filteredCategories.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-[var(--muted)]">
                        Ничего не найдено
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <label className="text-sm font-semibold">
            Остаток (шт)
            <input
              type="number"
              value={form.stock}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  stock: Number(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Цена (сум)
            <input
              type="number"
              value={form.price}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  price: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Заголовок описания (RU)
            <input
              value={form.descriptionTitleRu}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  descriptionTitleRu: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Заголовок описания (UZ)
            <input
              value={form.descriptionTitleUz}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  descriptionTitleUz: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Описание (RU)
            <textarea
              value={form.descriptionTextRu}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  descriptionTextRu: event.target.value,
                }))
              }
              rows={4}
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Описание (UZ)
            <textarea
              value={form.descriptionTextUz}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  descriptionTextUz: event.target.value,
                }))
              }
              rows={4}
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="radio"
              name="pricingMode"
              checked={form.pricingMode === "quantity"}
              onChange={() =>
                setForm((prev) => ({ ...prev, pricingMode: "quantity" }))
              }
            />
            По количеству
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="radio"
              name="pricingMode"
              checked={form.pricingMode === "portion"}
              onChange={() =>
                setForm((prev) => ({ ...prev, pricingMode: "portion" }))
              }
            />
            По порции
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Активен
          </label>
        </div>

        {form.pricingMode === "portion" ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Варианты порции
              </p>
              <GhostButton
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    portionOptions: [
                      ...prev.portionOptions,
                      { labelRu: "", labelUz: "", price: 0 },
                    ],
                  }))
                }
              >
                Добавить
              </GhostButton>
            </div>
            {form.portionOptions.map((option, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-4">
                <input
                  placeholder="RU"
                  value={option.labelRu}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((prev) => {
                      const next = [...prev.portionOptions];
                      next[index] = { ...next[index], labelRu: value };
                      return { ...prev, portionOptions: next };
                    });
                  }}
                  className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm"
                />
                <input
                  placeholder="UZ"
                  value={option.labelUz}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((prev) => {
                      const next = [...prev.portionOptions];
                      next[index] = { ...next[index], labelUz: value };
                      return { ...prev, portionOptions: next };
                    });
                  }}
                  className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm"
                />
                <input
                  placeholder="Цена"
                  type="number"
                  value={option.price}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setForm((prev) => {
                      const next = [...prev.portionOptions];
                      next[index] = { ...next[index], price: value };
                      return { ...prev, portionOptions: next };
                    });
                  }}
                  className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm"
                />
                <GhostButton
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      portionOptions: prev.portionOptions.filter(
                        (_, idx) => idx !== index
                      ),
                    }))
                  }
                >
                  Удалить
                </GhostButton>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <label className="text-sm font-semibold">
            Фото товара (можно несколько)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) {
                  startCropQueue(files);
                }
              }}
              className="mt-2 w-full rounded-2xl border border-dashed border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--muted)]"
            />
          </label>
          {form.images.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
              {form.images.map((url, index) => (
                <div key={url} className="relative">
                  <Image
                    src={url}
                    alt="product"
                    unoptimized
                    className="h-20 w-full rounded-xl object-cover"
                    width={360}
                    height={240}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        images: prev.images.filter((_, idx) => idx !== index),
                      }))
                    }
                    className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-[var(--danger)]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>


      <ImageCropper
        open={cropOpen && Boolean(cropSrc)}
        imageSrc={cropSrc ?? ""}
        aspect={productAspect}
        title="Обрезка товара"
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
