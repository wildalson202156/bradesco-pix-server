// Separate Node server for Bradesco Pix with mTLS (certificate .p12 or PEM).
import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE = process.env.BRADESCO_BASE_URL || "https://qrpix-h.bradesco.com.br";
const CERT_PATH = process.env.BRADESCO_CERT_PATH || path.resolve("certs/bradesco.p12");

function resolveCert() {
  if (process.env.BRADESCO_CERT_BASE64) {
    const tmpPath = path.resolve("/tmp/bradesco.p12");
    fs.writeFileSync(tmpPath, Buffer.from(process.env.BRADESCO_CERT_BASE64, "base64"));
    return tmpPath;
  }
  return CERT_PATH;
}

let resolvedCertPath = null;

function pem(v) {
  if (!v) return null;
  return v.includes("-----BEGIN") ? v.replace(/\\n/g, "\n") : Buffer.from(v, "base64").toString("utf8");
}

function agent() {
  const cert = pem(process.env.BRADESCO_CERT_PEM);
  const key = pem(process.env.BRADESCO_KEY_PEM);
  if (cert && key) {
    return new https.Agent({ cert, key, passphrase: process.env.BRADESCO_CERT_PASSWORD || undefined });
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
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json; try { json = JSON.parse(data); } catch { json = { raw: data }; }
        if (res.statusCode >= 400) {
          console.error(`[BRADESCO] ${method} ${url} -> ${res.statusCode}`, JSON.stringify(json));
          reject({ status: res.statusCode, body: json });
        } else {
          resolve(json);
        }
      });
    });
    req.on("error", (err) => {
      console.error("[BRADESCO] request error:", err.message);
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  try {
    const auth = Buffer.from(`${process.env.BRADESCO_CLIENT_ID}:${process.env.BRADESCO_CLIENT_SECRET}`).toString("base64");
    const r = await request("POST", `${BASE}/auth/server/oauth/token`, {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    }, "grant_type=client_credentials");
    return r.access_token;
  } catch (e) {
    console.error("[BRADESCO] getToken failed:", JSON.stringify(e.body || e));
    throw e;
  }
}

const app = express();
app.use(express.json());

app.post("/pix", async (req, res) => {
  try {
    const { valor, nome, cpf } = req.body;
    const token = await getToken();
    const txid = crypto.randomBytes(16).toString("hex");
    const cob = await request("PUT", `${BASE}/v2/cob/${txid}`, {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }, JSON.stringify({
      calendario: { expiracao: 3600 },
      ...(cpf ? { devedor: { cpf, nome } } : {}),
      valor: { original: Number(valor).toFixed(2) },
      chave: process.env.BRADESCO_PIX_KEY,
      solicitacaoPagador: nome ? `Pagamento - ${nome}` : "Pagamento",
    }));
    res.json({ txid, qrcode: cob.pixCopiaECola || cob.location, cobranca: cob });
  } catch (e) {
    console.error("[/pix] error:", JSON.stringify(e.body || e));
    res.status(e.status || 500).json({ error: e.body || String(e) });
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!/^https:\/\//.test(String(webhookUrl || ""))) {
      return res.status(400).json({ error: "webhookUrl must be an https URL" });
    }
    const token = await getToken();
    const key = process.env.BRADESCO_PIX_KEY;
    if (!key) return res.status(500).json({ error: "BRADESCO_PIX_KEY is not configured" });
    const out = await request(
      "PUT",
      `${BASE}/v2/webhook/${encodeURIComponent(key)}`,
      { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      JSON.stringify({ webhookUrl }),
    );
    res.json({ ok: true, webhook: out });
  } catch (e) {
    console.error("[/webhook] error:", JSON.stringify(e.body || e));
    res.status(e.status || 500).json({ error: e.body || String(e) });
  }
});

app.get("/health", (_q, r) => {
  const hasPem = Boolean(process.env.BRADESCO_CERT_PEM && process.env.BRADESCO_KEY_PEM);
  const fromBase64 = Boolean(process.env.BRADESCO_CERT_BASE64);
  const certOk = hasPem || fromBase64 || fs.existsSync(CERT_PATH);
  const source = hasPem ? "env:BRADESCO_CERT_PEM" : fromBase64 ? "env:BRADESCO_CERT_BASE64" : "file:" + CERT_PATH;
  r.json({ ok: true, cert: certOk, certSource: source });
});

app.listen(process.env.PORT || 3000, () => console.log("Bradesco Pix mTLS on", process.env.PORT || 3000));
