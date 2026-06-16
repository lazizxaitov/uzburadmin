import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import { serializeCustomerAccount } from "@/lib/public-customer-account";
import { requireCustomerSession } from "@/lib/public-customer-auth";

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

  const session = requireCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = body?.title?.toString().trim() ?? "";
  const addressLine = body?.addressLine?.toString().trim() ?? "";
  const entrance = body?.entrance?.toString().trim() ?? "";
  const floor = body?.floor?.toString().trim() ?? "";
  const comment = body?.comment?.toString().trim() ?? "";
  const latitude = body?.latitude == null ? null : Number(body.latitude);
  const longitude = body?.longitude == null ? null : Number(body.longitude);
  const requestedDefault = body?.isDefault == true;

  if (!title || !addressLine) {
    return NextResponse.json(
      { error: "Укажите название и адрес" },
      { status: 400 }
    );
  }

  const db = getDb();
  const hasAddresses = db
    .prepare("SELECT id FROM customer_addresses WHERE customer_id = ? LIMIT 1")
    .get(session.customer_id) as { id: number } | undefined;
  const isDefault = requestedDefault || !hasAddresses;
  const now = nowIso();

  db.transaction(() => {
    if (isDefault) {
      db.prepare(
        "UPDATE customer_addresses SET is_default = 0, updated_at = ? WHERE customer_id = ?"
      ).run(now, session.customer_id);
    }
    db.prepare(
      `INSERT INTO customer_addresses
       (customer_id, title, address_line, entrance, floor, comment, latitude, longitude, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.customer_id,
      title,
      addressLine,
      entrance,
      floor,
      comment,
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null,
      isDefault ? 1 : 0,
      now,
      now,
    );
  })();

  return NextResponse.json({
    ok: true,
    account: serializeCustomerAccount(session.customer_id),
  });
}
