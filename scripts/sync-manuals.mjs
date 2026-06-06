import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.resolve(root, "../docs");
const contentDir = path.join(root, "content");

const files = ["MANUAL-UTILIZADOR.md", "MANUAL-FINANCEIRO.md", "MANUAL-GAME-MODE.md"];

if (!fs.existsSync(contentDir)) {
  fs.mkdirSync(contentDir, { recursive: true });
}

for (const name of files) {
  const from = path.join(docsDir, name);
  const to = path.join(contentDir, name);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
    console.log(`sync-manuals: ${name}`);
  }
}
