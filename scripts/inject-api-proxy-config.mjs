import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || "").trim();

const out = path.join(root, "api/upstream.generated.cjs");
const content = `// Gerado automaticamente no build — não editar
module.exports = { baseUrl: ${JSON.stringify(url)} };
`;

fs.writeFileSync(out, content);

if (url) {
  console.log("inject-api-proxy: URL da API gravada para o proxy /api");
} else {
  console.warn(
    "inject-api-proxy: AVISO — define API_BASE_URL na Vercel (URL pública da Railway)"
  );
}
