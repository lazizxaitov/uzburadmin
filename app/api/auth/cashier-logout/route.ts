import { NextResponse } from "next/server";

import { CASHIER_SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: CASHIER_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}
