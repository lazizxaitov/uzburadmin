"use client";

import { useEffect, useState } from "react";

import {
  Card,
  SectionTitle,
  PrimaryButton,
  GhostButton,
  Modal,
} from "../_components/ui";
import ImageCropper from "../_components/image-cropper";

type Banner = {
  id: number;
  title_ru: string;
  title_uz: string;
  image_url: string;
  banner_type?: string;
  target_product_id?: number | null;
  target_category_id?: number | null;
  link_url?: string | null;
  sort_order: number;
  is_active: number;
};

type CategoryOption = {
  id: number;
  name_ru: string;
};

type ProductOption = {
  id: number;
  title_ru: string;
};

export default function BannersPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [form, setForm] = useState({
    titleRu: "",
    titleUz: "",
    imageUrl: "",
    bannerType: "image",
    targetProductId: "",
    targetCategoryId: "",
    linkUrl: "",
    sortOrder: 0,
    isActive: true,
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/banners").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
      fetch("/api/products").then((res) => res.json()),
    ])
      .then(([bannersData, categoriesData, productsData]) => {
        setItems(bannersData.items ?? []);
        setCategories(categoriesData.items ?? []);
        setProducts(productsData.items ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      titleRu: "",
      titleUz: "",
      imageUrl: "",
      bannerType: "image",
      targetProductId: "",
      targetCategoryId: "",
      linkUrl: "",
      sortOrder: 0,
      isActive: true,
    });
  };

  const startEdit = (item: Banner) => {
    setEditingId(item.id);
    setModalOpen(true);
    setForm({
      titleRu: item.title_ru,
      titleUz: item.title_uz,
      imageUrl: item.image_url,
      bannerType: item.banner_type ?? "image",
      targetProductId: item.target_product_id ? String(item.target_product_id) : "",
      targetCategoryId: item.target_category_id ? String(item.target_category_id) : "",
      linkUrl: item.link_url ?? "",
      sortOrder: item.sort_order ?? 0,
      isActive: item.is_active === 1,
    });
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

  const submit = async () => {
    if (form.bannerType === "product" && !form.targetProductId) return;
    if (form.bannerType === "category" && !form.targetCategoryId) return;

    const payload = {
      titleRu: form.titleRu,
      titleUz: form.titleUz,
      imageUrl: form.imageUrl,
      bannerType: form.bannerType,
      targetProductId:
        form.bannerType === "product"
          ? Number(form.targetProductId) || null
          : null,
      targetCategoryId:
        form.bannerType === "category"
          ? Number(form.targetCategoryId) || null
          : null,
      linkUrl: form.bannerType === "image" ? form.linkUrl || null : null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };

    if (editingId) {
      await fetch(`/api/banners/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    resetForm();
    setModalOpen(false);
    load();
  };

  const remove = async (id: number) => {
    await fetch(`/api/banners/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Баннеры"
        subtitle="Баннеры для главного экрана приложения."
      />

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--ink)]">Список баннеров</h3>
          <p className="text-sm text-[var(--muted)]">
            Создавайте и редактируйте баннеры через модальное окно.
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

      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <Card>Загрузка...</Card>
        ) : items.length === 0 ? (
          <Card>Пока нет баннеров.</Card>
        ) : (
          items.map((item) => (
            <Card key={item.id} className="flex flex-col gap-4">
              <img
                src={item.image_url}
                alt={item.title_ru}
                className="h-36 w-full rounded-2xl object-cover"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[var(--ink)]">
                    {item.title_ru}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.title_uz}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {item.banner_type === "product"
                      ? `Товар #${item.target_product_id ?? "—"}`
                      : item.banner_type === "category"
                        ? `Категория #${item.target_category_id ?? "—"}`
                        : item.link_url || "Целая картинка"}
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
        title={editingId ? "Редактировать баннер" : "Новый баннер"}
        footer={
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={submit}>
              {editingId ? "Сохранить" : "Создать"}
            </PrimaryButton>
            <GhostButton onClick={resetForm}>Очистить</GhostButton>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Заголовок (RU)
            <input
              value={form.titleRu}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, titleRu: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Заголовок (UZ)
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
          <label className="text-sm font-semibold">
            Тип баннера
            <select
              value={form.bannerType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  bannerType: event.target.value,
                  targetProductId: "",
                  targetCategoryId: "",
                  linkUrl: "",
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            >
              <option value="image">Целая картинка</option>
              <option value="product">Товар</option>
              <option value="category">Категория</option>
            </select>
          </label>
          {form.bannerType === "image" ? (
            <label className="text-sm font-semibold">
              Ссылка (optional)
              <input
                value={form.linkUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, linkUrl: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
              />
            </label>
          ) : form.bannerType === "product" ? (
            <label className="text-sm font-semibold">
              Товар
              <select
                value={form.targetProductId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    targetProductId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
              >
                <option value="">Выберите товар</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title_ru}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm font-semibold">
              Категория
              <select
                value={form.targetCategoryId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    targetCategoryId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
              >
                <option value="">Выберите категорию</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name_ru}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm font-semibold">
            Порядок
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  sortOrder: Number(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Фото баннера
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCropSrc(reader.result as string);
                    setCropOpen(true);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="mt-2 w-full rounded-2xl border border-dashed border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--muted)]"
            />
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
              className="h-5 w-5 rounded border-[var(--stroke)] text-[var(--brand)]"
            />
            Баннер активен
          </label>
        </div>

        {form.imageUrl ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--stroke)]">
            <img
              src={form.imageUrl}
              alt="preview"
              className="h-44 w-full object-cover"
            />
          </div>
        ) : null}
      </Modal>


      <ImageCropper
        open={cropOpen && Boolean(cropSrc)}
        imageSrc={cropSrc ?? ""}
        aspect={311 / 170}
        title="Обрезка баннера"
        onCancel={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        onConfirm={async (file) => {
          const url = await uploadImage(file);
          setForm((prev) => ({ ...prev, imageUrl: url }));
          setCropOpen(false);
          setCropSrc(null);
        }}
      />
    </div>
  );
}
