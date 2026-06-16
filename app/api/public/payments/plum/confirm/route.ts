import { NextResponse } from "next/server";

import { sendOrderToPoster } from "@/lib/poster-orders";
import { createPublicOrder, preparePublicOrder } from "@/lib/public-orders";
import { plumConfirmPayment } from "@/lib/plum";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

export const runtime = "nodejs";

function digitsOnly(value: unknown) {
  return value?.toString().replace(/\D/g, "") ?? "";
}

export async function POST(request: Request) {
  const authError = await requirePublicApiKey();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
  const rateError = await rateLimit();
  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: rateError.status });
  }

  const body = await request.json().catch(() => null);
  const session = Number(body?.session ?? 0);
  const otp = digitsOnly(body?.otp);

  if (!Number.isFinite(session) || session <= 0) {
    return NextResponse.json({ error: "Некорректная сессия" }, { status: 400 });
  }
  if (otp.length < 4) {
    return NextResponse.json({ error: "Некорректный код подтверждения" }, { status: 400 });
  }

  const prepared = preparePublicOrder(body);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  try {
    const payment = await plumConfirmPayment({ session, otp });
    const orderPayload = {
      ...prepared.value,
      payment: {
        method: "card",
        provider: "plum",
        status: payment.status === 1 ? "paid" : "confirmed",
        session,
        transactionId: Number(payment.transactionId ?? 0) || null,
        cardNumber: payment.cardNumber?.toString().trim() || "",
      },
    };
    const posterSync = await sendOrderToPoster(orderPayload);
    const order = createPublicOrder(orderPayload, {
      posterIncomingOrderId: posterSync.ok ? posterSync.incomingOrderId : "",
      posterTransactionId: posterSync.ok ? posterSync.transactionId : "",
      posterSyncStatus: posterSync.status,
      posterSyncError:
        posterSync.status === "success"
          ? ""
          : posterSync.message,
    });
    return NextResponse.json({
      ok: true,
      payment,
      order,
      posterSync,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка подтверждения оплаты";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
