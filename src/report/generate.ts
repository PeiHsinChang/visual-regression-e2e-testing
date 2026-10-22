import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportData } from "../engine/types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.join(__dirname, "template");

/** Resolve `images/foo.png` under reportDir on any OS. */
function resolveReportAsset(reportDir: string, relativeWebPath: string): string {
  const parts = relativeWebPath.split(/[/\\]/).filter(Boolean);
  return path.join(reportDir, ...parts);
}

/**
 * Inline PNGs as data: URLs so the report works when:
 * - opened from Cursor/VS Code Simple Browser (often blocks file:// subresources)
 * - Windows paths would otherwise use backslashes in JSON
 * data.json still keeps relative `images/...` paths for tooling.
 */
async function embedSnapshotImagesForHtml(
  reportDir: string,
  data: ReportData
): Promise<ReportData> {
  const cloned = structuredClone(data) as ReportData;
  for (const snap of cloned.snapshots) {
    const paths = [snap.baselineImage, snap.currentImage, snap.diffImage] as const;
    const abs = paths.map((p) => resolveReportAsset(reportDir, p));
    const bufs = await Promise.all(abs.map((a) => fs.readFile(a)));
    snap.baselineImage = `data:image/png;base64,${bufs[0].toString("base64")}`;
    snap.currentImage = `data:image/png;base64,${bufs[1].toString("base64")}`;
    snap.diffImage = `data:image/png;base64,${bufs[2].toString("base64")}`;
  }
  return cloned;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function generateReport(
  reportDir: string,
  data: ReportData
): Promise<void> {
  const template = await fs.readFile(
    path.join(TEMPLATE_DIR, "index.html"),
    "utf8"
  );
  const viewerJs = await fs.readFile(
    path.join(TEMPLATE_DIR, "viewer.js"),
    "utf8"
  );
  const viewerCss = await fs.readFile(
    path.join(TEMPLATE_DIR, "viewer.css"),
    "utf8"
  );

  const totalDiff = data.snapshots.reduce(
    (sum, s) => sum + s.diffPercent,
    0
  );
  const avgDiff = data.snapshots.length
    ? totalDiff / data.snapshots.length
    : 0;
  const totalRegions = data.snapshots.reduce(
    (sum, s) => sum + s.regions.length,
    0
  );

  const dataForHtml = await embedSnapshotImagesForHtml(reportDir, data);

  // IMPORTANT: when the second argument to String.prototype.replace is a
  // string, sequences like `$$`, `$&`, `$'`, `` $` `` are interpreted as
  // special replacement patterns. Our inline JS has `function $$(sel)` and
  // viewer.js / arbitrary computed-style values can contain `$` literals,
  // so we always pass a callback for large/dynamic blocks — the callback
  // form returns the value verbatim with no pattern interpretation.
  const html = template
    .replaceAll("{{BUILD_ID}}", () => escapeHtml(data.buildId))
    .replaceAll("{{GENERATED_AT}}", () => escapeHtml(data.generatedAt))
    .replaceAll("{{AVG_DIFF}}", () => avgDiff.toFixed(2))
    .replaceAll("{{TOTAL_REGIONS}}", () => String(totalRegions))
    .replaceAll("{{SNAPSHOT_COUNT}}", () => String(data.snapshots.length))
    .replace("{{INLINE_CSS}}", () => viewerCss)
    .replace("{{INLINE_JS}}", () => viewerJs)
    .replace("{{REPORT_DATA}}", () =>
      JSON.stringify(dataForHtml).replace(/<\/script>/gi, "<\\/script>")
    );

  await fs.writeFile(path.join(reportDir, "index.html"), html);
  await fs.writeFile(
    path.join(reportDir, "data.json"),
    JSON.stringify(data, null, 2)
  );
}
