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
  slug: string;
  image_url?: string | null;
  sort_order?: number | null;
  is_active: number;
};

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<string>("image/jpeg");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    nameRu: "",
    nameUz: "",
    slug: "",
    imageUrl: "",
    isActive: true,
  });

  const load = () => {
    setLoading(true);
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
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
      nameRu: "",
      nameUz: "",
      slug: "",
      imageUrl: "",
      isActive: true,
    });
  };

  const startEdit = (item: Category) => {
    setEditingId(item.id);
    setModalOpen(true);
    setForm({
      nameRu: item.name_ru,
      nameUz: item.name_uz,
      slug: item.slug,
      imageUrl: item.image_url ?? "",
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
    setSaving(true);
    setError(null);
    const payload = {
      nameRu: form.nameRu,
      nameUz: form.nameUz,
      slug: form.slug,
      imageUrl: form.imageUrl || null,
      isActive: form.isActive,
    };

    const response = editingId
      ? await fetch(`/api/categories/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Не удалось сохранить категорию");
      setSaving(false);
      return;
    }

    resetForm();
    setModalOpen(false);
    load();
    setSaving(false);
  };

  const remove = async (id: number) => {
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    load();
  };

  const toggleCategoryVisibility = async (item: Category) => {
    await fetch(`/api/categories/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameRu: item.name_ru,
        nameUz: item.name_uz,
        slug: item.slug,
        imageUrl: item.image_url ?? null,
        sortOrder: Number(item.sort_order ?? 0),
        isActive: item.is_active !== 1,
      }),
    });
    load();
  };

  const moveCategory = async (id: number, direction: "up" | "down") => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const current = items[index];
    const target = items[targetIndex];
    const currentOrder = Number(current.sort_order ?? 0);
    const targetOrder = Number(target.sort_order ?? 0);

    await Promise.all([
      fetch(`/api/categories/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRu: current.name_ru,
          nameUz: current.name_uz,
          slug: current.slug,
          imageUrl: current.image_url ?? null,
          sortOrder: targetOrder,
        }),
      }),
      fetch(`/api/categories/${target.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRu: target.name_ru,
          nameUz: target.name_uz,
          slug: target.slug,
          imageUrl: target.image_url ?? null,
          sortOrder: currentOrder,
        }),
      }),
    ]);

    load();
  };


  const updateSortOrder = async (id: number, value: number) => {
    const item = items.find((cat) => cat.id === id);
    if (!item) return;
    await fetch(`/api/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameRu: item.name_ru,
        nameUz: item.name_uz,
        slug: item.slug,
        imageUrl: item.image_url ?? null,
        sortOrder: value,
      }),
    });
    load();
  };

  const filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.name_ru.toLowerCase().includes(query) ||
      item.name_uz.toLowerCase().includes(query) ||
      item.slug.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[var(--ink)]">
            {"Категории"}
          </h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            {"Добавляйте и обновляйте категории каталога на двух языках."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={"Поиск по категориям"}
            className="h-10 w-64 rounded-2xl border border-[var(--stroke)] bg-white px-3 text-sm"
          />
          <GhostButton onClick={() => setSearchQuery("")}>
            {"Сброс"}
          </GhostButton>
        </div>
      </div>


      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-white/90 p-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--ink)]">
            Список категорий
          </h3>
          <p className="text-sm text-[var(--muted)]">
            Добавляйте и редактируйте категории через модальное окно.
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
      </div>

      {error ? (
        <Card className="border-[var(--danger)] bg-red-50/80 text-sm font-semibold text-red-700">
          {error}
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-[var(--stroke)] bg-white/95">
        {loading ? (
          <div className="p-5">Загрузка...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-5">Пока нет категорий.</div>
        ) : (
          <div>
            <div className="hidden grid-cols-[88px_minmax(0,1fr)_220px] gap-4 border-b border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)] md:grid">
              <div>Фото</div>
              <div>Категория</div>
              <div className="text-right">Действия</div>
            </div>
            <div className="divide-y divide-[var(--stroke)]">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[88px_minmax(0,1fr)_220px] md:items-center"
              >
                <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface)]">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name_ru}
                      unoptimized
                      className="h-20 w-20 object-cover md:h-[72px] md:w-[88px]"
                      width={176}
                      height={144}
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center text-xs text-[var(--muted)] md:h-[72px] md:w-[88px]">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[var(--ink)]">
                    {item.name_ru}
                  </p>
                  <p className="truncate text-sm text-[var(--muted)]">
                    {item.name_uz}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                    <span>ID: {item.id}</span>
                    <span>slug: {item.slug}</span>
                    <span>
                      {item.is_active === 1 ? "Активна" : "Скрыта"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <GhostButton onClick={() => moveCategory(item.id, "up")}>
                    ↑
                  </GhostButton>
                  <GhostButton onClick={() => moveCategory(item.id, "down")}>
                    ↓
                  </GhostButton>
                  <input
                    type="number"
                    value={item.sort_order ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setItems((prev) =>
                        prev.map((cat) =>
                          cat.id === item.id ? { ...cat, sort_order: value } : cat
                        )
                      );
                    }}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) {
                        updateSortOrder(item.id, value);
                      }
                    }}
                    className="h-9 w-20 rounded-2xl border border-[var(--stroke)] bg-white px-2 text-sm"
                  />
                  <GhostButton onClick={() => toggleCategoryVisibility(item)}>
                    {item.is_active === 1 ? "Скрыть" : "Показать"}
                  </GhostButton>
                  <GhostButton onClick={() => startEdit(item)}>Ред.</GhostButton>
                  <GhostButton onClick={() => remove(item.id)}>Удал.</GhostButton>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingId ? "Редактировать категорию" : "Новая категория"}
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
              value={form.nameRu}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nameRu: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Название (UZ)
            <input
              value={form.nameUz}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nameUz: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Slug
            <input
              value={form.slug}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, slug: event.target.value }))
              }
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink)]"
            />
          </label>
          <label className="text-sm font-semibold">
            Фото категории
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCropSrc(reader.result as string);
                    setCropType(file.type || "image/jpeg");
                    setCropOpen(true);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="mt-2 w-full rounded-2xl border border-dashed border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--muted)]"
            />
          </label>
        </div>

        {form.imageUrl ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--stroke)]">
            <Image
              src={form.imageUrl}
              alt="preview"
              unoptimized
              className="h-40 w-full object-cover"
              width={1200}
              height={720}
            />
          </div>
        ) : null}
      </Modal>


      <ImageCropper
        open={cropOpen && Boolean(cropSrc)}
        imageSrc={cropSrc ?? ""}
        aspect={3 / 2}
        maxWidth={900}
        maxHeight={600}
        title="Обрезка категории"
        helperText="Обрежьте фото так, как оно будет видно в списке и каталоге"
        targetWidth={900}
        targetHeight={600}
        onCancel={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        outputType={cropType}
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
