"use client";

import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";

import { GhostButton, PrimaryButton } from "./ui";

type Props = {
  open: boolean;
  imageSrc: string;
  aspect: number;
  title: string;
  helperText?: string;
  targetWidth?: number;
  targetHeight?: number;
  outputType?: string;
  maxWidth?: number;
  maxHeight?: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

function createImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

function getOutputMeta(outputType?: string) {
  const type = outputType ?? "image/jpeg";
  if (type === "image/png") {
    return { type, ext: "png", quality: undefined as number | undefined };
  }
  if (type === "image/webp") {
    return { type, ext: "webp", quality: 0.92 };
  }
  return { type: "image/jpeg", ext: "jpg", quality: 0.92 };
}

async function getCroppedFile(
  imageSrc: string,
  crop: Area,
  outputType?: string,
  maxWidth?: number,
  maxHeight?: number
) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  let targetWidth = crop.width;
  let targetHeight = crop.height;
  if (maxWidth || maxHeight) {
    const widthLimit = maxWidth ?? crop.width;
    const heightLimit = maxHeight ?? crop.height;
    const scale = Math.min(widthLimit / crop.width, heightLimit / crop.height, 1);
    targetWidth = Math.round(crop.width * scale);
    targetHeight = Math.round(crop.height * scale);
  }
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const meta = getOutputMeta(outputType);

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      resolve(
        new File([blob], `crop-${Date.now()}.${meta.ext}`, { type: meta.type })
      );
    }, meta.type, meta.quality);
  });
}

export default function ImageCropper({
  open,
  imageSrc,
  aspect,
  title,
  helperText,
  targetWidth,
  targetHeight,
  outputType,
  maxWidth,
  maxHeight,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback(
    (mediaSize: { width: number; height: number }) => {
      const mediaWidth = mediaSize.width;
      const mediaHeight = mediaSize.height;
      if (!mediaWidth || !mediaHeight) return;

      let cropWidth = mediaWidth;
      let cropHeight = cropWidth / aspect;

      if (cropHeight > mediaHeight) {
        cropHeight = mediaHeight;
        cropWidth = cropHeight * aspect;
      }

      const cropX = (mediaWidth - cropWidth) / 2;
      const cropY = (mediaHeight - cropHeight) / 2;

      setCroppedAreaPixels({
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      });
    },
    [aspect]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-3xl rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-[var(--ink)]">{title}</h3>
            {helperText || targetWidth || targetHeight ? (
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                {helperText ?? ""}
                {targetWidth || targetHeight
                  ? `${helperText ? " · " : ""}Результат: ${targetWidth ?? "auto"} × ${targetHeight ?? "auto"}`
                  : ""}
              </p>
            ) : null}
          </div>
          <GhostButton onClick={onCancel}>Закрыть</GhostButton>
        </div>

        <div className="relative h-[380px] w-full overflow-hidden rounded-3xl bg-black/80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onMediaLoaded={onMediaLoaded}
            showGrid
          />
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-white/70 ring-inset" />
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold">
            Масштаб
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton
            disabled={saving}
            onClick={async () => {
              if (!croppedAreaPixels) return;
              setSaving(true);
              setError(null);
              try {
                const file = await getCroppedFile(
                  imageSrc,
                  croppedAreaPixels,
                  outputType,
                  maxWidth,
                  maxHeight
                );
                await onConfirm(file);
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Ошибка сохранения";
                setError(message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Сохраняю..." : "Обрезать"}
          </PrimaryButton>
          <GhostButton onClick={onCancel}>Отмена</GhostButton>
        </div>
        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
