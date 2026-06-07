const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "x-forwarded-host",
]);

/** fetch() descomprime gzip/br — não reencaminhar estes headers da resposta upstream. */
const UPSTREAM_RESPONSE_SKIP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

function resolveUpstreamPath(reqUrl) {
  const incoming = new URL(reqUrl || "/", "http://localhost");

  const fromRewrite = incoming.searchParams.get("path");
  if (fromRewrite) {
    incoming.searchParams.delete("path");
    const rest = incoming.searchParams.toString();
    const base = fromRewrite.startsWith("/") ? fromRewrite : `/${fromRewrite}`;
    return rest ? `${base}?${rest}` : base;
  }

  const stripped = incoming.pathname.replace(/^\/api/, "") || "/";
  const rest = incoming.searchParams.toString();
  return rest ? `${stripped}?${rest}` : stripped;
}

function normalizeBaseUrl(raw) {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function validateBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return "API_BASE_URL inválido — usa uma URL HTTPS completa, ex.: https://xxx.up.railway.app";
  }

  if (parsed.hostname.endsWith(".railway.internal")) {
    return "API_BASE_URL usa um domínio *.railway.internal — só funciona dentro da Railway. Na Vercel, usa o domínio público (Settings → Networking → Public URL).";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "API_BASE_URL deve começar por https://";
  }

  return null;
}

function describeFetchError(error) {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
  if (cause && typeof cause === "object" && cause !== null && "code" in cause) {
    const code = String(cause.code);
    if (code === "ENOTFOUND") {
      return "Domínio da API não encontrado — confirma API_BASE_URL na Vercel (URL pública da Railway).";
    }
    if (code === "ECONNREFUSED") {
      return "Ligação recusada — a API na Railway pode estar parada ou a escutar noutra porta.";
    }
    if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      return "Certificado SSL inválido no URL da API.";
    }
    return `fetch failed (${code})`;
  }

  return error instanceof Error ? error.message : "Erro desconhecido";
}

function readUpstreamBaseUrl() {
  const fromEnv = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL;
  if (fromEnv?.trim()) return fromEnv.trim();

  try {
    const generated = require("./upstream.generated.cjs");
    if (generated?.baseUrl?.trim()) return generated.baseUrl.trim();
  } catch {
    // ficheiro ainda não gerado no build
  }

  return "";
}

module.exports = async function handler(req, res) {
  const rawBase = readUpstreamBaseUrl();

  if (!rawBase) {
    return json(res, 500, {
      code: "API_BASE_URL_MISSING",
      message:
        "Falta configurar API_BASE_URL na Vercel (Settings → Environment Variables) com a URL pública da API na Railway, ex.: https://xxx.up.railway.app — depois faz Redeploy.",
    });
  }

  const baseUrl = normalizeBaseUrl(rawBase);
  const baseUrlError = validateBaseUrl(baseUrl);
  if (baseUrlError) {
    return json(res, 500, {
      code: "API_BASE_URL_INVALID",
      message: baseUrlError,
    });
  }

  try {
    const upstreamPath = resolveUpstreamPath(req.url);
    const targetUrl = `${baseUrl}${upstreamPath}`;
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      if (key.toLowerCase() === "accept-encoding") continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("accept-encoding", "identity");

    const method = req.method || "GET";
    const body =
      method === "GET" || method === "HEAD" ? undefined : await readBody(req);

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (UPSTREAM_RESPONSE_SKIP.has(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    return json(res, 502, {
      code: "API_PROXY_ERROR",
      message: "Não foi possível encaminhar o pedido para a API.",
      details: describeFetchError(error),
    });
  }
};
