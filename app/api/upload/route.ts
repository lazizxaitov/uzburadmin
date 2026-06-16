import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { getSession } from "@/lib/auth";
import { getUploadsDir } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await (file as File).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const originalName = (file as File).name ?? "upload";
  const ext = path.extname(originalName) || ".jpg";
  const filename = `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}${ext}`;

  const uploadDir = getUploadsDir();
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  await fs.writeFile(filePath, buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
