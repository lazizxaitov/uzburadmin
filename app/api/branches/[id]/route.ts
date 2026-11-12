import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getBranch, parseBranchInput, saveBranch } from "@/lib/branches";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!id || !getBranch(id)) {
    return NextResponse.json({ error: "Филиал не найден" }, { status: 404 });
  }
  const parsed = parseBranchInput(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  saveBranch(parsed.value, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  // Заказы сохраняют название филиала (branch_name), поэтому история не теряется.
  getDb().prepare("DELETE FROM branches WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
