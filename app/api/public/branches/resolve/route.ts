import { NextResponse } from "next/server";

import { resolveBranchForAddress } from "@/lib/branches";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

export const runtime = "nodejs";

/**
 * Определяет филиал по адресу клиента (та же логика, что при оформлении заказа)
 * и отдаёт его ссылки на оплату Payme / Click.
 * Тело: { latitude, longitude } или { address: { latitude, longitude } }.
 */
export async function POST(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const address = (body?.address ?? body ?? {}) as Record<string, unknown>;
  const toNumber = (value: unknown) =>
    value === null || value === undefined || value === "" ? null : Number(value);

  const result = resolveBranchForAddress(toNumber(address.latitude), toNumber(address.longitude));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const branch = result.branch;
  return NextResponse.json({
    ok: true,
    branch: branch
      ? {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          distanceKm: result.distanceKm,
          paymeUrl: branch.payme_url,
          clickUrl: branch.click_url,
        }
      : null,
  });
}
