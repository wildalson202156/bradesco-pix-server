// Servidor Node separado para Pix Bradesco com mTLS (certificado .p12).
// Hospede em um serviço Node (Render, Railway, VPS). Não roda dentro do app.
import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE = process.env.BRADESCO_BASE_URL || "https://qrpix-h.bradesco.com.br";
const CERT_PATH = process.env.BRADESCO_CERT_PATH || path.resolve("certs/bradesco.p12");

function agent() {
  return new https.Agent({
    pfx: fs.readFileSync(CERT_PATH),
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
        res.statusCode >= 400 ? reject({ status: res.statusCode, body: json }) : resolve(json);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const auth = Buffer.from(`${process.env.BRADESCO_CLIENT_ID}:${process.env.BRADESCO_CLIENT_SECRET}`).toString("base64");
  const r = await request("POST", `${BASE}/auth/server/oauth/token`, {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }, "grant_type=client_credentials");
  return r.access_token;
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
    res.status(e.status || 500).json({ error: e.body || String(e) });
  }
});

app.get("/health", (_q, r) => r.json({ ok: true, cert: fs.existsSync(CERT_PATH) }));

app.listen(process.env.PORT || 3000, () => console.log("Bradesco Pix mTLS on", process.env.PORT || 3000));
