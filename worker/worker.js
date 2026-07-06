/* worker.js — o "guardião" do painel de administração (Cloudflare Worker).
 *
 * Fluxo:
 *   1. O painel faz login com a Microsoft (MSAL) e recebe um ID token assinado.
 *   2. Cada chamada do painel chega aqui com esse token no header Authorization.
 *   3. Este Worker VERIFICA a assinatura do token direto com a Microsoft
 *      (JWKS + RSA), confere se o app é o seu e se o e-mail é o permitido.
 *   4. Só então repassa a chamada à API do GitHub usando o token guardado
 *      como SECRET aqui no Worker — que nunca aparece em código público.
 *
 * Configuração (no painel da Cloudflare → Settings → Variables):
 *   GITHUB_TOKEN   (Secret)  token fine-grained com Contents: read/write no repo
 *   MS_CLIENT_ID   (Var)     Application (client) ID do registro na Microsoft
 *   ALLOWED_EMAIL  (Var)     seu e-mail Microsoft (pode ser lista: a@x.com,b@y.com)
 *   ALLOWED_ORIGIN (Var)     https://ljcgj.github.io   (origem do site)
 */

const GH_API = "https://api.github.com";

// Só estes caminhos da API do GitHub podem passar (defesa em profundidade):
const ALLOWED_PATHS = [
  /^\/user$/,
  /^\/repos\/LJCGJ\/Portif-lio_de_aplicativo(\/|$)/
];

// Emissor de contas Microsoft pessoais (tenant "consumers")
const MS_ISSUER = "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";
const JWKS_URL = "https://login.microsoftonline.com/consumers/discovery/v2.0/keys";

let jwksCache = null;
let jwksFetchedAt = 0;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // 1) exige e verifica o ID token da Microsoft
      const auth = request.headers.get("Authorization") || "";
      const idToken = auth.replace(/^Bearer\s+/i, "").trim();
      if (!idToken) return json({ message: "Sem credencial de login." }, 401, cors);

      const claims = await verifyMicrosoftToken(idToken, env);

      // 2) e-mail na lista de permitidos?
      const email = String(claims.email || claims.preferred_username || "").toLowerCase();
      const allowed = String(env.ALLOWED_EMAIL || "")
        .toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
      if (!email || !allowed.includes(email)) {
        return json({ message: "Este e-mail não tem acesso ao painel." }, 403, cors);
      }

      // 3) caminho permitido?
      const url = new URL(request.url);
      if (!ALLOWED_PATHS.some(re => re.test(url.pathname))) {
        return json({ message: "Caminho não permitido." }, 403, cors);
      }

      // 4) repassa ao GitHub com o token secreto
      const isBodyless = request.method === "GET" || request.method === "HEAD";
      const ghResponse = await fetch(GH_API + url.pathname + url.search, {
        method: request.method,
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": "Bearer " + env.GITHUB_TOKEN,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ljcgj-admin-worker",
          ...(isBodyless ? {} : { "Content-Type": "application/json" })
        },
        body: isBodyless ? undefined : await request.text()
      });

      const body = await ghResponse.text();
      return new Response(body, {
        status: ghResponse.status,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    } catch (err) {
      return json({ message: err.message || "Falha na autenticação." }, 401, cors);
    }
  }
};

/* ------------------- verificação do token Microsoft ------------------- */

async function verifyMicrosoftToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token malformado.");

  const header = JSON.parse(textFromB64Url(parts[0]));
  const payload = JSON.parse(textFromB64Url(parts[1]));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && now > payload.exp + 60) throw new Error("Sessão expirada — entre novamente.");
  if (payload.nbf && now < payload.nbf - 60) throw new Error("Token ainda não é válido.");
  if (payload.aud !== env.MS_CLIENT_ID) throw new Error("Token não é deste aplicativo.");
  if (payload.iss !== MS_ISSUER) throw new Error("Emissor do token não reconhecido.");

  // assinatura RSA contra as chaves públicas da Microsoft
  const jwk = await findKey(header.kid);
  if (!jwk) throw new Error("Chave de assinatura não encontrada.");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const sig = bytesFromB64Url(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!valid) throw new Error("Assinatura do token inválida.");

  return payload;
}

async function findKey(kid) {
  // cache de 1h das chaves públicas da Microsoft
  if (!jwksCache || Date.now() - jwksFetchedAt > 3600_000) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error("Não consegui obter as chaves da Microsoft.");
    jwksCache = await res.json();
    jwksFetchedAt = Date.now();
  }
  let key = (jwksCache.keys || []).find(k => k.kid === kid);
  if (!key) {
    // chave pode ter rotacionado: força uma atualização
    jwksCache = null;
    return findKeyFresh(kid);
  }
  return key;
}

async function findKeyFresh(kid) {
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Não consegui obter as chaves da Microsoft.");
  jwksCache = await res.json();
  jwksFetchedAt = Date.now();
  return (jwksCache.keys || []).find(k => k.kid === kid) || null;
}

/* ------------------------------ utilidades ------------------------------ */

function bytesFromB64Url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function textFromB64Url(b64url) {
  return new TextDecoder().decode(bytesFromB64Url(b64url));
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
  const ok = allowed && origin.replace(/\/$/, "") === allowed;
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed || "null",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}
