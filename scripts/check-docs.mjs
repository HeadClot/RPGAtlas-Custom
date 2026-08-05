/* RPGAtlas — scripts/check-docs.mjs
   Validate the wiki source and its committed static-site mirror. This catches
   missing pages, broken anchors, and generated output drift without requiring
   a browser or third-party Markdown package. GPL-3.0-or-later. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHref, slugify } from "./md-render.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wikiDir = join(root, "wiki");
const siteDir = join(root, "docs-site");
const pages = readdirSync(wikiDir)
  .filter((name) => name.endsWith(".md") && !name.startsWith("_") && name !== "README.md")
  .map((name) => name.replace(/\.md$/, ""))
  .sort();

const errors = [];
const pageSources = new Map();
for (const page of pages) pageSources.set(page, readFileSync(join(wikiDir, `${page}.md`), "utf8"));

for (const [sourcePage, source] of pageSources) {
  const links = source.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  for (const match of links) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
    const [rawPage, anchor] = href.split("#");
    const targetPage = rawPage || sourcePage;
    if (targetPage.includes("/") || targetPage.endsWith(".md")) continue;
    if (!pageSources.has(targetPage)) {
      errors.push(`${sourcePage}: missing page ${targetPage}`);
      continue;
    }
    if (anchor) {
      const headings = [...pageSources.get(targetPage).matchAll(/^#{1,4}\s+(.*)$/gm)]
        .map((heading) => slugify(heading[1]));
      if (!headings.includes(anchor)) errors.push(`${sourcePage}: missing anchor ${href}`);
    }
  }
}

const expectedSiteFiles = new Set(["style.css", ...pages.map((page) => resolveHref(page))]);
for (const file of expectedSiteFiles) {
  if (!existsSync(join(siteDir, file))) errors.push(`docs-site: missing generated file ${file}`);
}
for (const file of readdirSync(siteDir)) {
  if (file.endsWith(".html") && !expectedSiteFiles.has(file)) {
    errors.push(`docs-site: unexpected generated file ${file}`);
  }
}

if (errors.length) {
  console.error(`[docs:check] ${errors.length} issue(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`[docs:check] ${pages.length} wiki pages, links, anchors, and generated pages are consistent`);
}
