// Separate Node server for Bradesco Pix with mTLS (.p12 / PEM certificate).
// Host it on a Node service (Render, Railway, VPS). It does not run inside the app.
// The certificate can come from the BRADESCO_CERT_PEM + BRADESCO_KEY_PEM env vars,
// the BRADESCO_CERT_BASE64 env var (.p12 content in base64), or the certs/bradesco.p12 file (fallback).
import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE = process.env.BRADESCO_BASE_URL || "https://qrpix-h.bradesco.com.br";
const CERT_PATH = process.env.BRADESCO_CERT_PATH || path.resolve("certs/bradesco.p12");

// Resolve the certificate: if BRADESCO_CERT_BASE64 exists, decode it and
// save it temporarily, otherwise fall back to the file at CERT_PATH.
function resolveCert() {
  if (process.env.BRADESCO_CERT_BASE64) {
    const tmpPath = path.resolve("/tmp/bradesco.p12");
    fs.writeFileSync(tmpPath, Buffer.from(process.env.BRADESCO_CERT_BASE64, "base64"));
    return tmpPath;
  }
  return CERT_PATH;
}

let resolvedCertPath = null;

// Accepts PEM (BRADESCO_CERT_PEM + BRADESCO_KEY_PEM, raw text or base64) or a .p12 file.
function pem(value) {
  if (!value) return null;
  return value.includes("-----BEGIN")
    ? value.replace(/\\n/g, "\n")
    : Buffer.from(value, "base64").toString("utf8");
}

function agent() {
  const cert = pem(process.env.BRADESCO_CERT_PEM);
  const key = pem(process.env.BRADESCO_KEY_PEM);
  if (cert && key) {
    return new https.Agent({
      cert,
      key,
      passphrase: process.env.BRADESCO_CERT_PASSWORD || undefined,
    });
  }
  if (!resolvedCertPath) resolvedCertPath = resolveCert();
  return new https.Agent({
    pfx: fs.readFileSync(resolvedCertPath),
    passphrase: process.env.BRADESCO_CERT_PASSWORD || "",
  });
}

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent: agent() }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json;
        try { json = JSON.parse(data); } catch { json = { raw: data }; }
        res.statusCode >= 400 ? reject({ status: res.statusCode, body: json }) : resolve(json);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const auth = Buffer.from(
    `${process.env.BRADESCO_CLIENT_ID}:${process.env.BRADESCO_CLIENT_SECRET}`
  ).toString("base64");
  const result = await request("POST", `${BASE}/auth/server/oauth/token`, {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }, "grant_type=client_credentials");
  return result.access_token;
}

const app = express();
app.use(express.json());

app.post("/pix", async (req, res) => {
  try {
    const { valor, nome, cpf } = req.body;
    const token = await getToken();
    const txid = crypto.randomBytes(16).toString("hex");
    const charge = await request("PUT", `${BASE}/v2/cob/${txid}`, {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }, JSON.stringify({
      calendario: { expiracao: 3600 },
      ...(cpf ? { devedor: { cpf, nome } } : {}),
      valor: { original: Number(valor).toFixed(2) },
      chave: process.env.BRADESCO_PIX_KEY,
      solicitacaoPagador: nome ? `Pagamento - ${nome}` : "Pagamento",
    }));
    res.json({ txid, qrcode: charge.pixCopiaECola || charge.location, cobranca: charge });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.body || String(error) });
  }
});

app.get("/health", (_req, res) => {
  const fromBase64 = Boolean(process.env.BRADESCO_CERT_BASE64);
  res.json({
    ok: true,
    cert: fromBase64 || fs.existsSync(CERT_PATH),
    certSource: fromBase64 ? "env:BRADESCO_CERT_BASE64" : "file:" + CERT_PATH,
  });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Bradesco Pix mTLS on", process.env.PORT || 3000)
);
