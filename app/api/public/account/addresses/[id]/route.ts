import { NextResponse } from "next/server";

import { getDb, nowIso } from "@/lib/db";
import { rateLimit, requirePublicApiKey } from "@/lib/public-auth";
import { serializeCustomerAccount } from "@/lib/public-customer-account";
import { requireCustomerSession } from "@/lib/public-customer-auth";

export const runtime = "nodejs";

function getOwnedAddress(customerId: number, addressId: number) {
  return getDb()
    .prepare(
      `SELECT id, is_default
       FROM customer_addresses
       WHERE id = ? AND customer_id = ?`
    )
    .get(addressId, customerId) as { id: number; is_default: number } | undefined;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const addressId = Number((await params).id);
  if (!addressId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = getOwnedAddress(session.customer_id, addressId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const title = body?.title?.toString().trim() ?? "";
  const addressLine = body?.addressLine?.toString().trim() ?? "";
  const entrance = body?.entrance?.toString().trim() ?? "";
  const floor = body?.floor?.toString().trim() ?? "";
  const comment = body?.comment?.toString().trim() ?? "";
  const latitude = body?.latitude == null ? null : Number(body.latitude);
  const longitude = body?.longitude == null ? null : Number(body.longitude);
  const isDefault = body?.isDefault == true;

  if (!title || !addressLine) {
    return NextResponse.json(
      { error: "Укажите название и адрес" },
      { status: 400 }
    );
  }

  const db = getDb();
  const now = nowIso();
  db.transaction(() => {
    if (isDefault) {
      db.prepare(
        "UPDATE customer_addresses SET is_default = 0, updated_at = ? WHERE customer_id = ?"
      ).run(now, session.customer_id);
    }
    db.prepare(
      `UPDATE customer_addresses
       SET title = ?, address_line = ?, entrance = ?, floor = ?, comment = ?, latitude = ?, longitude = ?, is_default = ?, updated_at = ?
       WHERE id = ? AND customer_id = ?`
    ).run(
      title,
      addressLine,
      entrance,
      floor,
      comment,
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null,
      isDefault ? 1 : 0,
      now,
      addressId,
      session.customer_id,
    );

    const hasDefault = db
      .prepare(
        "SELECT id FROM customer_addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1"
      )
      .get(session.customer_id) as { id: number } | undefined;
    if (!hasDefault) {
      db.prepare(
        "UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1)"
      ).run(now, session.customer_id);
    }
  })();

  return NextResponse.json({
    ok: true,
    account: serializeCustomerAccount(session.customer_id),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const addressId = Number((await params).id);
  if (!addressId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = getOwnedAddress(session.customer_id, addressId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const now = nowIso();
  db.transaction(() => {
    db.prepare("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?").run(
      addressId,
      session.customer_id,
    );
    if (Number(existing.is_default ?? 0) === 1) {
      db.prepare(
        "UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1)"
      ).run(now, session.customer_id);
    }
  })();

  return NextResponse.json({
    ok: true,
    account: serializeCustomerAccount(session.customer_id),
  });
}
