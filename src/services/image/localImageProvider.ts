import * as path from "path";

export function getLocalFallbackUrl(): string {
  return `file://${path.resolve("public/assets/fallback.svg")}`;
}
