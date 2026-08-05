import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectPath = join(process.cwd(), "tests", "fixtures", "practice-clearing-project.json");

export function practiceClearingJson() {
  return readFileSync(projectPath, "utf8");
}

export async function gotoWithPracticeClearing(page, path = "/play.html") {
  const json = practiceClearingJson();
  await page.goto(path);
  await page.evaluate((seeded) => localStorage.setItem("rpgatlas_project", seeded), json);
  await page.goto(path);
}
