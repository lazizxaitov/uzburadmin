import { NextResponse } from "next/server";

import {
  buildCashierSessionCookie,
  createSessionToken,
  verifyCashierCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = body?.username?.toString() ?? "";
  const password = body?.password?.toString() ?? "";

  if (!verifyCashierCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = createSessionToken(username, "cashier");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildCashierSessionCookie(token));
  return response;
}
