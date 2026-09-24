// build.mjs — 把 world/*.md 与 data/*.json 打包为 bundle.js（使 file:// 直接打开可玩）
// 用法：node build.mjs
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));

const world = { bible: readFileSync(join(root, "world/bible.md"), "utf8"), regions: {} };
for (const f of readdirSync(join(root, "world/regions"))) {
  if (f.endsWith(".md")) world.regions[f.replace(/\.md$/, "")] = readFileSync(join(root, "world/regions", f), "utf8");
}

const data = {};
for (const f of readdirSync(join(root, "data"))) {
  if (f.endsWith(".json")) data[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(root, "data", f), "utf8"));
}

const out = `/* bundle.js — 由 build.mjs 自动生成，请勿手改。内容资产源文件在 world/ 与 data/。 */
(function (G) {
  G.WORLD = ${JSON.stringify(world)};
  G.DATA = ${JSON.stringify(data)};
})(typeof window !== "undefined" ? (window.ASTREA = window.ASTREA || {}) : (globalThis.ASTREA = globalThis.ASTREA || {}));
`;
writeFileSync(join(root, "bundle.js"), out, "utf8");
console.log("bundle.js written:", Object.keys(world.regions), Object.keys(data));
