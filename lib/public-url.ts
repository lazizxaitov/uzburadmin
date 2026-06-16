import "server-only";

import { headers } from "next/headers";

export async function getPublicOrigin() {
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto")?.trim() || "https";
  const host =
    hdrs.get("x-forwarded-host")?.trim() ||
    hdrs.get("host")?.trim() ||
    "uzburadmin.uz";
  return `${proto}://${host}`;
}

export async function resolvePublicUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const origin = await getPublicOrigin();
  return trimmed.startsWith("/") ? `${origin}${trimmed}` : `${origin}/${trimmed}`;
}
