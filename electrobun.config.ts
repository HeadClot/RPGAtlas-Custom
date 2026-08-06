import type { ElectrobunConfig } from "electrobun";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
const frontendStage = process.env.RPGATLAS_FRONTEND_STAGE || "build/electrobun/frontend";
const appName = process.env.RPGATLAS_APP_NAME || "RPGAtlas";

export default {
  app: {
    name: appName,
    identifier: process.env.RPGATLAS_APP_IDENTIFIER || "com.rpgatlas.editor",
    version: packageJson.version,
    description: "RPGAtlas desktop editor",
    fileAssociations: [{ ext: ["rpgatlas"], name: "RPGAtlas Game", role: "Editor" }],
  },
  runtime: { exitOnLastWindowClosed: false },
  build: {
    buildFolder: "build/electrobun",
    artifactFolder: "artifacts/electrobun",
    bun: { entrypoint: "src/electrobun/main.ts" },
    copy: {
      [frontendStage]: "views/frontend",
    },
    win: { icon: "img/system/rpgatlas.ico" },
    linux: { icon: "img/system/icon_set.png" },
  },
} satisfies ElectrobunConfig;
