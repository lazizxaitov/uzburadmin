import { NextResponse } from "next/server";

import { listBranches } from "@/lib/branches";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

export const runtime = "nodejs";

/** Активные филиалы для карты в приложении (самовывоз / в ресторане). */
export async function GET() {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }
  const items = listBranches({ onlyActive: true }).map((branch) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
    paymeUrl: branch.payme_url,
    clickUrl: branch.click_url,
  }));
  return NextResponse.json({ items });
}
