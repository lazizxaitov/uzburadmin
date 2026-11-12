import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { listBranches, parseBranchInput, saveBranch } from "@/lib/branches";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ items: listBranches() });
}

export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = parseBranchInput(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const id = saveBranch(parsed.value);
  return NextResponse.json({ ok: true, id });
}
