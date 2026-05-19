import * as dotenv from "dotenv";
import * as path from "path";

import { brand } from "../config/brand";
import { runCardNewsPipeline } from "../pipeline/runCardNewsPipeline";
import { pickNextUnprocessedItem } from "../services/contentSelector";
import { markProcessed } from "../services/processedContentRegistry";
import {
  buildImageAuditReport,
  printImageAuditSummary,
} from "../validation/imageAuditReport";
import { writeTextFile } from "../utils/fs";
import { parseCliArgs } from "../utils/text";

dotenv.config();

function createRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `daily-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main(): Promise<void> {
  const args    = parseCliArgs(process.argv.slice(2));
  const dryRun  = "dry-run" in args;
  const runId   = createRunId();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ${brand.brandName} | Daily 카드뉴스 배치`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  runId   : ${runId}`);
  console.log(`  모드    : ${dryRun ? "dry-run (선택만)" : "생성"}`);
  console.log();

  const next = await pickNextUnprocessedItem();

  if (!next) {
    console.log("\n  처리할 신규 글이 없습니다. 종료합니다.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return;
  }

  if (dryRun) {
    console.log("\n  [dry-run] 다음 제작 대상");
    console.log(`  contentId : ${next.contentId}`);
    console.log(`  제목      : ${next.title}`);
    if (next.publishMonth) console.log(`  게시월    : ${next.publishMonth}`);
    if (next.relatedDiseases) console.log(`  관련질병  : ${next.relatedDiseases}`);
    console.log(`  URL       : ${next.sourceUrl}`);
    console.log("\n  카드뉴스 생성·registry 기록은 수행하지 않았습니다.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return;
  }

  const result = await runCardNewsPipeline({
    contentId:           next.contentId,
    topic:               next.title,
    pattern:             "narrative",
    capture:             true,
    skipKdcaListSearch:  true,
  });

  const audit = buildImageAuditReport({
    deck:      result.deck,
    promptLog: result.promptLog,
    contentId: next.contentId,
    runId,
  });

  const reportPath = path.join(result.outputDir, "batch-report.json");
  writeTextFile(reportPath, JSON.stringify(audit, null, 2));

  printImageAuditSummary(audit);
  console.log(`\n[Daily] batch-report 저장: ${reportPath}`);

  markProcessed({
    contentId:   next.contentId,
    title:       next.title,
    processedAt: new Date().toISOString(),
    outputDir:   result.outputDir,
    deckId:      result.deck.id,
    runId,
    imageSummary: audit.imageSummary,
    auditStatus:  audit.overallStatus,
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Daily 배치 완료");
  console.log(`  contentId : ${next.contentId}`);
  console.log(`  HTML      : ${result.htmlPath}`);
  console.log(`  PNG       : ${result.imagePaths.length}장`);
  console.log(`  audit     : ${audit.overallStatus}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("[오류]", err instanceof Error ? err.message : err);
  process.exit(1);
});
