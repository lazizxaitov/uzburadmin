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
            className="h-9 w-52 rounded-2xl border border-[var(--stroke)] bg-white px-3 text-xs"
          />
          <GhostButton onClick={() => setSearchQuery("")}>
            {"Поиск"}
          </GhostButton>
        </div>
      </div>


      <Card className="flex flex-wrap items-center justify-between gap-4">
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
          <Card>Пока нет категорий.</Card>
        ) : (
          filteredItems.map((item) => (
            <Card key={item.id} className="flex flex-col gap-4">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name_ru}
                  unoptimized
                  className="h-36 w-full rounded-2xl object-cover"
                  width={1200}
                  height={720}
                />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[var(--ink)]">
                    {item.name_ru}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.name_uz}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    slug: {item.slug}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {"\u0421\u0442\u0430\u0442\u0443\u0441"}:{" "}
                    {item.is_active === 1
                      ? "\u0412\u0438\u0434\u0438\u043c\u0430 \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0438"
                      : "\u0421\u043a\u0440\u044b\u0442\u0430 \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0438"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <GhostButton onClick={() => moveCategory(item.id, "up")}>
                      {"\u2191"}
                    </GhostButton>
                    <GhostButton onClick={() => moveCategory(item.id, "down")}>
                      {"\u2193"}
                    </GhostButton>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">{"\u041f\u043e\u0440\u044f\u0434\u043e\u043a"}</span>
                    <input
                      type="number"
                      value={item.sort_order ?? 0}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setItems((prev) =>
                          prev.map((cat) =>
                            cat.id === item.id
                              ? { ...cat, sort_order: value }
                              : cat
                          )
                        );
                      }}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          updateSortOrder(item.id, value);
                        }
                      }}
                      className="w-20 rounded-2xl border border-[var(--stroke)] bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <GhostButton onClick={() => toggleCategoryVisibility(item)}>
                    {item.is_active === 1
                      ? "\u0421\u043a\u0440\u044b\u0442\u044c"
                      : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c"}
                  </GhostButton>
                  <GhostButton onClick={() => startEdit(item)}>{"\u0420\u0435\u0434."}</GhostButton>
                  <GhostButton onClick={() => remove(item.id)}>{"\u0423\u0434\u0430\u043b."}</GhostButton>
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
