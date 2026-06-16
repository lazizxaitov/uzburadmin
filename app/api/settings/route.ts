import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = getDb().prepare("SELECT * FROM settings WHERE id = 1").get();
  return NextResponse.json({ item });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const cafeName = body?.cafeName?.toString()?.trim();
  if (!cafeName) {
    return NextResponse.json({ error: "Missing cafe name" }, { status: 400 });
  }

  getDb().prepare(`
    UPDATE settings
    SET cafe_name = ?, phone = ?, address = ?, work_hours = ?, delivery_fee = ?,
        min_order = ?, currency = ?, bonus_percent = ?, bonus_redeem_amount = ?,
        card_payment_enabled = ?, cash_payment_enabled = ?, card_payment_text = ?,
        payme_qr_image_url = ?, click_qr_image_url = ?, support_phone = ?,
        instagram = ?, telegram = ?, splash_image_url = ?, splash_title_ru = ?,
        splash_title_uz = ?, splash_subtitle_ru = ?, splash_subtitle_uz = ?,
        splash_show_once = ?, catalog_mode = ?, mobile_api_key = ?, plum_base_url = ?,
        plum_username = ?, plum_password = ?, eskiz_enabled = ?, eskiz_email = ?,
        eskiz_password = ?, eskiz_from = ?, eskiz_callback_url = ?,
        eskiz_notify_on_register = ?, eskiz_notify_on_order_created = ?,
        eskiz_notify_on_order_status = ?, cashier_username = ?, cashier_password = ?,
        updated_at = ?
    WHERE id = 1
  `).run(
    cafeName,
    body?.phone?.toString()?.trim() ?? "",
    body?.address?.toString()?.trim() ?? "",
    body?.workHours?.toString()?.trim() ?? "",
    Number(body?.deliveryFee ?? 0),
    Number(body?.minOrder ?? 0),
    body?.currency?.toString()?.trim() ?? "сум",
    Number(body?.bonusPercent ?? 0),
    Number(body?.bonusRedeemAmount ?? 0),
    body?.cardPaymentEnabled === false ? 0 : 1,
    body?.cashPaymentEnabled === false ? 0 : 1,
    body?.cardPaymentText?.toString() ?? "",
    body?.paymeQrImageUrl?.toString()?.trim() ?? "",
    body?.clickQrImageUrl?.toString()?.trim() ?? "",
    body?.supportPhone?.toString()?.trim() ?? "",
    body?.instagram?.toString()?.trim() ?? "",
    body?.telegram?.toString()?.trim() ?? "",
    body?.splashImageUrl?.toString()?.trim() ?? "",
    body?.splashTitleRu?.toString()?.trim() ?? "",
    body?.splashTitleUz?.toString()?.trim() ?? "",
    body?.splashSubtitleRu?.toString()?.trim() ?? "",
    body?.splashSubtitleUz?.toString()?.trim() ?? "",
    body?.splashShowOnce === false ? 0 : 1,
    body?.catalogMode === "demo" ? "demo" : "real",
    body?.mobileApiKey?.toString()?.trim() ?? "",
    body?.plumBaseUrl?.toString()?.trim() || "https://pay.myuzcard.uz",
    body?.plumUsername?.toString()?.trim() ?? "",
    body?.plumPassword?.toString()?.trim() ?? "",
    body?.eskizEnabled === true ? 1 : 0,
    body?.eskizEmail?.toString()?.trim() ?? "",
    body?.eskizPassword?.toString()?.trim() ?? "",
    body?.eskizFrom?.toString()?.trim() || "4546",
    body?.eskizCallbackUrl?.toString()?.trim() ?? "",
    body?.eskizNotifyOnRegister === false ? 0 : 1,
    body?.eskizNotifyOnOrderCreated === false ? 0 : 1,
    body?.eskizNotifyOnOrderStatus === false ? 0 : 1,
    body?.cashierUsername?.toString()?.trim() || "uzburkassa",
    body?.cashierPassword?.toString()?.trim() || "kassa123",
    nowIso(),
  );

  return NextResponse.json({ ok: true });
}
