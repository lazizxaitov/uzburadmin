import { NextResponse } from "next/server";

import { buildSessionCookie, createSessionToken, verifyCredentials } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = body?.username?.toString() ?? "";
  const password = body?.password?.toString() ?? "";

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = createSessionToken(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildSessionCookie(token));
  return response;
}
