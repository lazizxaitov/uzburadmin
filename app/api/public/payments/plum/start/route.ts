import { NextResponse } from "next/server";

import { plumStartPayment } from "@/lib/plum";
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
  const amount = Number(body?.amount ?? 0);
  const cardNumber = digitsOnly(body?.cardNumber);
  const expireDate = digitsOnly(body?.expireDate);
  const extraId = body?.extraId?.toString()?.trim() ?? "";
  const transactionData = body?.transactionData?.toString()?.trim() ?? "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Некорректная сумма" }, { status: 400 });
  }
  if (cardNumber.length < 12 || cardNumber.length > 19) {
    return NextResponse.json({ error: "Некорректный номер карты" }, { status: 400 });
  }
  if (expireDate.length !== 4) {
    return NextResponse.json({ error: "Некорректный срок карты" }, { status: 400 });
  }
  if (!extraId) {
    return NextResponse.json({ error: "Отсутствует extraId" }, { status: 400 });
  }

  try {
    const result = await plumStartPayment({
      amount,
      cardNumber,
      expireDate,
      extraId,
      transactionData,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка оплаты";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
