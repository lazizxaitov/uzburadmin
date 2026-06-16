import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const LEGACY_DATA_DIR = path.join(process.cwd(), "data");

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getDataDir() {
  const customDir = process.env.UZBUR_DATA_DIR?.trim();
  const resolved = customDir ? path.resolve(customDir) : DEFAULT_DATA_DIR;
  ensureDirectory(resolved);
  return resolved;
}

export function getUploadsDir() {
  const customDir = process.env.UZBUR_UPLOADS_DIR?.trim();
  const resolved = customDir
    ? path.resolve(customDir)
    : path.join(getDataDir(), "uploads");
  ensureDirectory(resolved);
  return resolved;
}

export function getDatabasePath() {
  const customPath = process.env.UZBUR_DB_PATH?.trim();
  if (customPath) {
    const resolved = path.resolve(customPath);
    ensureDirectory(path.dirname(resolved));
    return resolved;
  }

  const preferred = path.join(getDataDir(), "uzbur.db");
  const legacy = path.join(LEGACY_DATA_DIR, "loftburgers.db");
  if (!fs.existsSync(preferred) && fs.existsSync(legacy)) {
    return legacy;
  }
  return preferred;
}
