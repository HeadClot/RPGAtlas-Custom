/* RPGAtlas — scripts/check-docs.mjs
   Non-mutating documentation validation. It checks that the committed static
   site is generated from wiki/ today, that every source page and internal link
   resolves, and that Markdown heading anchors used by links still exist.
   The generated comparison is rendered into the OS temp directory, never into
   docs-site/. GPL-3.0-or-later. */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wikiDir = join(root, "wiki");
const siteDir = join(root, "docs-site");
const buildScript = join(root, "scripts", "build-docs-site.mjs");
const failures = [];

const addFailure = (message) => failures.push(message);

function walk(dir, predicate, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, predicate, files);
    else if (predicate(path)) files.push(path);
  }
  return files;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headingsOf(path) {
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^#{1,4}\s+(.*)$/);
        return match ? [slugify(match[1])] : [];
      }),
  );
}

function expectedWikiPages() {
  return readdirSync(wikiDir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_") && name !== "README.md")
    .map((name) => name.replace(/\.md$/, ""));
}

function compareGeneratedSite(tempDir) {
  const expectedFiles = new Set([
    "style.css",
    ...expectedWikiPages().map((name) => (name === "Home" ? "index.html" : `${name}.html`)),
  ]);
  const actualFiles = new Set(
    walk(tempDir, (path) => statSync(path).isFile()).map((path) => relative(tempDir, path).replaceAll("\\", "/")),
  );
  for (const name of expectedFiles) if (!actualFiles.has(name)) addFailure(`generated site is missing ${name}`);
  for (const name of actualFiles) if (!expectedFiles.has(name)) addFailure(`generated site has unexpected file ${name}`);

  for (const name of expectedFiles) {
    const committed = join(siteDir, name);
    const generated = join(tempDir, name);
    if (!existsSync(committed) || !existsSync(generated)) continue;
    if (readFileSync(committed).compare(readFileSync(generated)) !== 0) {
      addFailure(`docs-site/${name} is stale; run npm run docs:build`);
    }
  }
}

function resolveMarkdownTarget(source, href) {
  const [rawPath, fragment] = href.split("#");
  if (!rawPath) return { path: source, fragment };

  const sourceDir = dirname(source);
  const direct = resolve(sourceDir, rawPath);
  const candidates = [direct];

  if (!extname(rawPath)) {
    candidates.push(`${direct}.md`, join(direct, "README.md"));
    if (source.startsWith(wikiDir + "\\") || source.startsWith(wikiDir + "/")) {
      candidates.push(join(wikiDir, `${rawPath}.md`));
    }
  }

  return {
    path: candidates.find((candidate) => existsSync(candidate)) ?? candidates[0],
    fragment,
  };
}

function checkLinks(source) {
  const text = readFileSync(source, "utf8");
  const headingsCache = new Map();
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|data:|javascript:)/i.test(href)) continue;

    const target = resolveMarkdownTarget(source, href);
    if (!existsSync(target.path)) {
      addFailure(`${relative(root, source)}: broken link ${href}`);
      continue;
    }
    if (!target.fragment || extname(target.path).toLowerCase() !== ".md") continue;

    if (!headingsCache.has(target.path)) headingsCache.set(target.path, headingsOf(target.path));
    if (!headingsCache.get(target.path).has(target.fragment.toLowerCase())) {
      addFailure(`${relative(root, source)}: missing anchor ${href}`);
    }
  }
}

const tempDir = mkdtempSync(join(tmpdir(), "rpgatlas-docs-"));
try {
  const build = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    env: { ...process.env, RPGATLAS_DOCS_OUT: tempDir },
    encoding: "utf8",
  });
  if (build.status !== 0) {
    addFailure(`docs build failed in temporary output:\n${build.stderr || build.stdout}`);
  } else {
    compareGeneratedSite(tempDir);
  }

  const markdownFiles = [
    join(root, "README.md"),
    join(root, "AGENTS.md"),
    ...walk(wikiDir, (path) => path.endsWith(".md")),
    ...walk(join(root, "docs"), (path) => path.endsWith(".md")),
    ...walk(join(root, "server"), (path) => basename(path) === "README.md"),
    ...walk(join(root, "src-tauri"), (path) => basename(path) === "README.md"),
    ...walk(join(root, "img"), (path) => path.endsWith(".md")),
  ];
  for (const path of markdownFiles) checkLinks(path);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`[docs:check] ${failures.length} issue(s) found`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[docs:check] OK — ${expectedWikiPages().length} wiki pages, generated site fresh, internal links valid`);
}
