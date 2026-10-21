import { NextResponse } from "next/server";

import { sendOrderToPoster } from "@/lib/poster-orders";
import { sendOrderToIiko } from "@/lib/iiko-orders";
import { createPublicOrder, preparePublicOrder } from "@/lib/public-orders";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";

export const runtime = "nodejs";

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
  const prepared = preparePublicOrder(body);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  const [posterSync, iikoSync] = await Promise.all([
    sendOrderToPoster(prepared.value),
    sendOrderToIiko(prepared.value),
  ]);

  const order = createPublicOrder(prepared.value, {
    posterIncomingOrderId: posterSync.ok ? posterSync.incomingOrderId : "",
    posterTransactionId: posterSync.ok ? posterSync.transactionId : "",
    posterSyncStatus: posterSync.status,
    posterSyncError:
      posterSync.status === "success"
        ? ""
        : posterSync.message,
    iikoOrderId: iikoSync.ok ? iikoSync.orderId : "",
    iikoCorrelationId: iikoSync.ok ? iikoSync.correlationId : "",
    iikoSyncStatus: iikoSync.status,
    iikoSyncError: iikoSync.status === "success" ? "" : iikoSync.message,
  });

  return NextResponse.json({
    ok: true,
    order,
    posterSync,
    iikoSync,
  });
}
