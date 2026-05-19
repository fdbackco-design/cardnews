import * as dotenv from "dotenv";
import { getLocalFallbackUrl } from "./localImageProvider";

dotenv.config();

type PexelsResponse = {
  photos?: { src: { large2x: string; large: string } }[];
};

async function fetchCandidates(
  apiKey: string,
  query: string,
  page: number,
): Promise<string[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query",       query);
  url.searchParams.set("per_page",    "6");
  url.searchParams.set("page",        String(page));
  url.searchParams.set("orientation", "portrait");

  try {
    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.warn(`[Pexels] HTTP ${res.status}: ${query.slice(0, 40)}`);
      return [];
    }
    const data = (await res.json()) as PexelsResponse;
    return (data.photos ?? [])
      .map((p) => p.src.large2x || p.src.large)
      .filter(Boolean) as string[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Pexels] 요청 실패 — ${msg.slice(0, 60)}`);
    return [];
  }
}

export async function searchPexelsUnique(
  query: string,
  usedUrls?: Set<string>,
): Promise<string> {
  const apiKey = process.env["PEXELS_API_KEY"] ?? "";
  if (!apiKey) {
    console.warn("[Pexels] PEXELS_API_KEY 미설정");
    return getLocalFallbackUrl();
  }

  for (const page of [1, 2]) {
    const candidates = await fetchCandidates(apiKey, query, page);
    for (const candidate of candidates) {
      if (!usedUrls || !usedUrls.has(candidate)) {
        usedUrls?.add(candidate);
        return candidate;
      }
    }
  }

  return getLocalFallbackUrl();
}
