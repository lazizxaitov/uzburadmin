"use client";

import { useEffect, useRef, useState } from "react";

// Leaflet грузим с CDN при открытии формы — без новых npm-зависимостей и API-ключей.
const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const DEFAULT_CENTER: [number, number] = [41.3111, 69.2797]; // Ташкент

/* eslint-disable @typescript-eslint/no-explicit-any */
type LeafletMap = any;
type LeafletMarker = any;

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const win = window as any;
  if (win.L) return Promise.resolve(win.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(win.L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error("Не удалось загрузить карту"));
    };
    document.body.appendChild(script);
  });
  return leafletPromise;
}

type SearchResult = { display_name: string; lat: string; lon: string };

export type MapPoint = { lat: number; lng: number };

/**
 * Выбор точки на карте: клик по карте или перетаскивание пина,
 * поиск по адресу. Найденный адрес передаётся в onAddress.
 */
export default function MapPointPicker({
  value,
  onChange,
  onAddress,
}: {
  value: MapPoint | null;
  onChange: (point: MapPoint) => void;
  onAddress?: (address: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap>(null);
  const markerRef = useRef<LeafletMarker>(null);
  const onChangeRef = useRef(onChange);
  const onAddressRef = useRef(onAddress);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onAddressRef.current = onAddress;
  }, [onChange, onAddress]);

  const reverseGeocode = async (point: MapPoint) => {
    if (!onAddressRef.current) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&lat=${point.lat}&lon=${point.lng}`,
      );
      const data = await response.json();
      const a = data?.address ?? {};
      const short = [a.road ?? a.pedestrian ?? a.neighbourhood, a.house_number]
        .filter(Boolean)
        .join(", ");
      const text = short || String(data?.display_name ?? "");
      if (text) onAddressRef.current?.(text);
    } catch {
      // адрес не обязателен
    }
  };

  const placeMarker = (L: any, point: MapPoint, { pan = true, notify = true } = {}) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([point.lat, point.lng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const { lat, lng } = markerRef.current.getLatLng();
        const next = { lat: round(lat), lng: round(lng) };
        onChangeRef.current(next);
        void reverseGeocode(next);
      });
    } else {
      markerRef.current.setLatLng([point.lat, point.lng]);
    }
    if (pan) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16));
    if (notify) {
      onChangeRef.current(point);
      void reverseGeocode(point);
    }
  };

  // Инициализация карты.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        // Стандартная иконка Leaflet берёт картинки по относительному пути — укажем CDN.
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon-2x.png`,
          iconUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon.png`,
          shadowUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-shadow.png`,
        });
        const start: [number, number] = value ? [value.lat, value.lng] : DEFAULT_CENTER;
        const map = L.map(containerRef.current).setView(start, value ? 16 : 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        mapRef.current = map;
        if (value) placeMarker(L, value, { pan: false, notify: false });
        map.on("click", (event: any) => {
          placeMarker(L, { lat: round(event.latlng.lat), lng: round(event.latlng.lng) }, { pan: false });
        });
        // Модалка могла открыться с анимацией — пересчитать размер.
        setTimeout(() => map.invalidateSize(), 200);
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Карта создаётся один раз при открытии формы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Координаты поменяли вручную в поле — передвинуть пин.
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !value) return;
    const current = markerRef.current?.getLatLng();
    if (current && round(current.lat) === value.lat && round(current.lng) === value.lng) return;
    placeMarker(L, value, { notify: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  const search = async () => {
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru&countrycodes=uz&q=${encodeURIComponent(text)}`,
      );
      setResults(await response.json());
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: SearchResult) => {
    const L = (window as any).L;
    setResults([]);
    setQuery(result.display_name);
    if (!L) return;
    const point = { lat: round(Number(result.lat)), lng: round(Number(result.lon)) };
    placeMarker(L, point);
  };

  return (
    <div className="space-y-2">
      <div className="relative flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          placeholder="Поиск: улица, дом, ориентир…"
          className="w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void search()}
          className="rounded-2xl border border-[var(--stroke)] bg-white px-4 text-sm font-bold"
        >
          {searching ? "…" : "Найти"}
        </button>
        {results.length ? (
          <div className="absolute left-0 right-0 top-full z-[1000] mt-1 overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-lg">
            {results.map((result) => (
              <button
                key={`${result.lat},${result.lon}`}
                type="button"
                onClick={() => chooseResult(result)}
                className="block w-full border-b border-[var(--stroke)] px-4 py-2 text-left text-xs last:border-b-0 hover:bg-[var(--accent)]"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--accent)]"
      />
      <p className="text-xs text-[var(--muted)]">
        {error
          ? error
          : value
            ? `Точка: ${value.lat}, ${value.lng} — перетащите пин или кликните по карте, чтобы уточнить.`
            : "Кликните по карте на здании филиала или найдите адрес через поиск."}
      </p>
    </div>
  );
}

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}
