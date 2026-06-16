import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsDir } from "@/lib/storage";

export const runtime = "nodejs";

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function tryReadFile(filePath: string) {
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeSegments = segments.filter((segment) => !segment.includes(".."));
  const filename = safeSegments.join("/");

  const dataDir = getUploadsDir();
  const publicDir = path.join(process.cwd(), "public", "uploads");
  const dataPath = path.join(dataDir, filename);
  const publicPath = path.join(publicDir, filename);

  const data = (await tryReadFile(dataPath)) ?? (await tryReadFile(publicPath));
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": getContentType(filename),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
