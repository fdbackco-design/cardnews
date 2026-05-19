import * as dotenv from "dotenv";

import { brand } from "./config/brand";
import { runCardNewsPipeline } from "./pipeline/runCardNewsPipeline";
import type { PlanCardNewsOptions } from "./generator/planCardNews";
import { parseCliArgs } from "./utils/text";

dotenv.config();

// ── CLI 인자 파싱 ─────────────────────────────────────────────────────────────

type CliOptions = PlanCardNewsOptions & {
  contentId?: string;
  keyword?:   string;
  capture:    boolean;
};

function resolveOptions(argv: string[]): CliOptions {
  const args = parseCliArgs(argv);

  const topic     = args["topic"]     ?? undefined;
  const pattern   = args["pattern"]   === "list" ? "list" : ("narrative" as const);
  const cardCount = args["cardCount"] ? parseInt(args["cardCount"], 10) : 6;
  const contentId = args["contentId"];
  const keyword   = args["keyword"];
  const capture   = "capture" in args;

  return { topic, pattern, cardCount, contentId, keyword, capture };
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = resolveOptions(process.argv.slice(2));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ${brand.brandName} | ${brand.seriesLabel} 카드뉴스 생성기`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (opts.keyword)   console.log(`  키워드  : ${opts.keyword}`);
  if (opts.topic)     console.log(`  주제    : ${opts.topic}`);
  console.log(`  패턴    : ${opts.pattern}`);
  if (opts.contentId) console.log(`  ID      : ${opts.contentId}`);
  if (opts.capture)   console.log(`  캡처    : ON`);
  console.log();

  await runCardNewsPipeline({
    topic:     opts.topic,
    pattern:   opts.pattern,
    cardCount: opts.cardCount,
    contentId: opts.contentId,
    keyword:   opts.keyword,
    capture:   opts.capture,
  });
}

main().catch((err) => {
  console.error("[오류]", err instanceof Error ? err.message : err);
  process.exit(1);
});
