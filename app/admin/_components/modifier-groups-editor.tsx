"use client";

import { GhostButton } from "./ui";

export type ModifierOptionForm = {
  id?: number | null;
  iikoId?: string;
  nameRu: string;
  nameUz: string;
  price: number;
  maxQty: number;
  defaultQty: number;
  isActive: boolean;
};

export type ModifierGroupForm = {
  id?: number | null;
  iikoGroupId?: string;
  nameRu: string;
  nameUz: string;
  minQty: number;
  maxQty: number;
  freeQty: number;
  options: ModifierOptionForm[];
};

/** Группа модификаторов в формате API (snake_case из БД). */
export type ModifierGroupApi = {
  id: number;
  iiko_group_id: string;
  name_ru: string;
  name_uz: string;
  min_qty: number;
  max_qty: number;
  free_qty: number;
  options: Array<{
    id: number;
    iiko_id: string;
    name_ru: string;
    name_uz: string;
    price: number;
    max_qty: number;
    default_qty: number;
    is_active: number;
  }>;
};

export function modifierGroupsFromApi(groups: ModifierGroupApi[] | undefined): ModifierGroupForm[] {
  return (groups ?? []).map((group) => ({
    id: group.id,
    iikoGroupId: group.iiko_group_id,
    nameRu: group.name_ru,
    nameUz: group.name_uz,
    minQty: group.min_qty,
    maxQty: group.max_qty,
    freeQty: group.free_qty,
    options: group.options.map((option) => ({
      id: option.id,
      iikoId: option.iiko_id,
      nameRu: option.name_ru,
      nameUz: option.name_uz,
      price: option.price,
      maxQty: option.max_qty,
      defaultQty: option.default_qty,
      isActive: option.is_active === 1,
    })),
  }));
}

const inputClass =
  "w-full rounded-2xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm";
const numberClass =
  "w-full rounded-2xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm";

function groupRule(group: ModifierGroupForm) {
  if (group.minQty > 0 && group.minQty === group.maxQty) {
    return group.minQty === 1 ? "Обязательно, выбрать одно" : `Обязательно, ровно ${group.minQty}`;
  }
  if (group.minQty > 0) return `Обязательно, от ${group.minQty} до ${group.maxQty}`;
  return `Необязательно, до ${group.maxQty}`;
}

export default function ModifierGroupsEditor({
  value,
  onChange,
  syncedFromIiko,
}: {
  value: ModifierGroupForm[];
  onChange: (next: ModifierGroupForm[]) => void;
  syncedFromIiko: boolean;
}) {
  const updateGroup = (index: number, patch: Partial<ModifierGroupForm>) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    patch: Partial<ModifierOptionForm>,
  ) => {
    const options = [...value[groupIndex].options];
    options[optionIndex] = { ...options[optionIndex], ...patch };
    updateGroup(groupIndex, { options });
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Модификаторы</p>
          <p className="text-xs text-[var(--muted)]">
            Покупатель выбирает их перед добавлением в корзину (например, тесто, соус, добавки).
          </p>
        </div>
        <GhostButton
          onClick={() =>
            onChange([
              ...value,
              { nameRu: "", nameUz: "", minQty: 0, maxQty: 1, freeQty: 0, options: [] },
            ])
          }
        >
          Добавить группу
        </GhostButton>
      </div>

      {syncedFromIiko && value.some((group) => group.iikoGroupId) ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Модификаторы загружены из iiko. При синхронизации состав, русские названия, цены и
          лимиты обновятся из iiko. Скрытые здесь опции и ваши узбекские названия сохранятся.
        </p>
      ) : null}

      {value.map((group, groupIndex) => (
        <div
          key={group.id ?? `new-${groupIndex}`}
          className="space-y-3 rounded-2xl border border-[var(--stroke)] p-3"
        >
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_90px_90px_90px_auto]">
            <input
              placeholder="Название группы RU (например, Соус)"
              value={group.nameRu}
              onChange={(event) => updateGroup(groupIndex, { nameRu: event.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Название группы UZ"
              value={group.nameUz}
              onChange={(event) => updateGroup(groupIndex, { nameUz: event.target.value })}
              className={inputClass}
            />
            <label className="text-[11px] text-[var(--muted)]">
              Мин.
              <input
                type="number"
                min={0}
                value={group.minQty}
                onChange={(event) =>
                  updateGroup(groupIndex, { minQty: Math.max(0, Number(event.target.value)) })
                }
                className={numberClass}
              />
            </label>
            <label className="text-[11px] text-[var(--muted)]">
              Макс.
              <input
                type="number"
                min={1}
                value={group.maxQty}
                onChange={(event) =>
                  updateGroup(groupIndex, { maxQty: Math.max(1, Number(event.target.value)) })
                }
                className={numberClass}
              />
            </label>
            <label className="text-[11px] text-[var(--muted)]">
              Бесплатно
              <input
                type="number"
                min={0}
                value={group.freeQty}
                onChange={(event) =>
                  updateGroup(groupIndex, { freeQty: Math.max(0, Number(event.target.value)) })
                }
                className={numberClass}
              />
            </label>
            <GhostButton onClick={() => onChange(value.filter((_, idx) => idx !== groupIndex))}>
              Удалить
            </GhostButton>
          </div>
          <p className="text-xs text-[var(--muted)]">{groupRule(group)}</p>

          <div className="space-y-2">
            {group.options.map((option, optionIndex) => (
              <div
                key={option.id ?? `new-${optionIndex}`}
                className={`grid items-end gap-2 md:grid-cols-[1fr_1fr_110px_80px_auto_auto] ${
                  option.isActive ? "" : "opacity-50"
                }`}
              >
                <input
                  placeholder="Опция RU"
                  value={option.nameRu}
                  onChange={(event) =>
                    updateOption(groupIndex, optionIndex, { nameRu: event.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Опция UZ"
                  value={option.nameUz}
                  onChange={(event) =>
                    updateOption(groupIndex, optionIndex, { nameUz: event.target.value })
                  }
                  className={inputClass}
                />
                <label className="text-[11px] text-[var(--muted)]">
                  Доплата, сум
                  <input
                    type="number"
                    min={0}
                    value={option.price}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, {
                        price: Math.max(0, Number(event.target.value)),
                      })
                    }
                    className={numberClass}
                  />
                </label>
                <label className="text-[11px] text-[var(--muted)]">
                  Макс. шт
                  <input
                    type="number"
                    min={1}
                    value={option.maxQty}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, {
                        maxQty: Math.max(1, Number(event.target.value)),
                      })
                    }
                    className={numberClass}
                  />
                </label>
                <label className="flex items-center gap-1 pb-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={option.isActive}
                    onChange={(event) =>
                      updateOption(groupIndex, optionIndex, { isActive: event.target.checked })
                    }
                  />
                  Показывать
                </label>
                <GhostButton
                  onClick={() =>
                    updateGroup(groupIndex, {
                      options: group.options.filter((_, idx) => idx !== optionIndex),
                    })
                  }
                >
                  ✕
                </GhostButton>
              </div>
            ))}
            <GhostButton
              onClick={() =>
                updateGroup(groupIndex, {
                  options: [
                    ...group.options,
                    { nameRu: "", nameUz: "", price: 0, maxQty: 1, defaultQty: 0, isActive: true },
                  ],
                })
              }
            >
              + Опция
            </GhostButton>
          </div>
        </div>
      ))}
    </div>
  );
}
