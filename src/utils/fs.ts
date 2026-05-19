import * as fs from "fs";
import * as path from "path";

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureOutputDirs(baseDir: string): {
  html: string;
  images: string;
  debug: string;
} {
  const html = path.join(baseDir, "html");
  const images = path.join(baseDir, "images");
  const debug = path.join(baseDir, "debug");
  [html, images, debug].forEach(ensureDir);
  return { html, images, debug };
}

export function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

export function slugify(text: string): string {
  return text
    .replace(/[^\w\s가-힣]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 40);
}

export function timestampedSlug(topic: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${date}-${slugify(topic)}`;
}
