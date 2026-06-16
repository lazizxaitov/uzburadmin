import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { maybeAutoSyncPoster } from "@/lib/poster-sync";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }
  await maybeAutoSyncPoster();

  const db = getDb();
  const item = db.prepare("SELECT * FROM settings WHERE id = 1").get() as
    | {
        payme_qr_image_url?: string | null;
        click_qr_image_url?: string | null;
      }
    | undefined;

  const enrichedItem = item
    ? {
        ...item,
        card_payment_methods: [
          {
            code: "payme",
            title: "Payme",
            image_url: item.payme_qr_image_url ?? "",
          },
          {
            code: "click",
            title: "Click",
            image_url: item.click_qr_image_url ?? "",
          },
        ],
      }
    : null;
  return NextResponse.json({ item: enrichedItem });
}
