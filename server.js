const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

const PORT = process.env.PORT || 10000;

function getCerts() {
  let publico = process.env.BRADESCO_CERT_PUBLICO;
  let privado = process.env.BRADESCO_CERT_PRIVADO;

  if (!publico && process.env.BRADESCO_CERT && process.env.BRADESCO_CERT.includes("BEGIN CERTIFICATE")) {
    publico = process.env.BRADESCO_CERT;
  }
  if (!privado) {
    if (process.env.BRADESCO_CERT && process.env.BRADESCO_CERT.includes("BEGIN PRIVATE KEY")) {
      privado = process.env.BRADESCO_CERT;
    }
    if (process.env.BRADESCO_CERT_PRIVADO) privado = process.env.BRADESCO_CERT_PRIVADO;
  }

  if (publico) publico = publico.replace(/\\n/g, '\n');
  if (privado) privado = privado.replace(/\\n/g, '\n');

  return { publico, privado };
}

function getAgent() {
  const { publico, privado } = getCerts();
  if (!publico || !privado) throw new Error("Certificados não configurados");
  return new https.Agent({ cert: publico, key: privado, rejectUnauthorized: false });
}

async function getToken() {
  const agent = getAgent();
  
  // TENTATIVA 1: SEM SCOPE (essa que deu TOKEN OK no seu log)
  try {
    console.log("Tentando TOKEN sem scope...");
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    const res = await axios.post(`${process.env.BRADESCO_BASE_URL}/oauth/token`, params, {
      httpsAgent: agent,
      auth: { username: process.env.BRADESCO_CLIENT_ID, password: process.env.BRADESCO_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log("TOKEN OK sem scope");
    return res.data.access_token;
  } catch (e) {
    console.log("Falhou sem scope, tentando com cobv.write", e.response?.data);
    // TENTATIVA 2: COM COBV.WRITE
    const params2 = new URLSearchParams();
    params2.append('grant_type', 'client_credentials');
    params2.append('scope', 'cobv.write');
    const res2 = await axios.post(`${process.env.BRADESCO_BASE_URL}/oauth/token`, params2, {
      httpsAgent: agent,
      auth: { username: process.env.BRADESCO_CLIENT_ID, password: process.env.BRADESCO_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log("TOKEN OK com cobv.write");
    return res2.data.access_token;
  }
}

app.get('/', (req, res) => { res.send('DG MOTOS - PIX COM VENCIMENTO ONLINE'); });

app.get('/criar-cobv', async (req, res) => {
  try {
    const valor = (req.query.valor || "150.00").toString();
    const dias = parseInt(req.query.dias) || 3;
    const venc = new Date();
    venc.setDate(venc.getDate() + dias);
    const dataVenc = venc.toISOString().split('T')[0];
    const txid = `DGM${Date.now()}${Math.floor(Math.random()*10000)}`.substring(0, 32);

    const token = await getToken();
    const agent = getAgent();

    const payload = {
      calendario: { dataDeVencimento: dataVenc, validadeAposVencimento: 30 },
      valor: { original: valor },
      chave: process.env.BRADESCO_PIX_CHAVE,
      solicitacaoPagador: `DG MOTOS Venc ${dataVenc}`
    };

    console.log("Enviando PUT /v2/cobv/" + txid);

    const response = await axios.put(`${process.env.BRADESCO_BASE_URL}/v2/cobv/${txid}`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    res.json({ success: true, txid, pixCopiaECola: response.data.pixCopiaECola, dados: response.data });

  } catch (e) {
    console.error("ERRO FINAL:", JSON.stringify(e.response?.data || e.message, null, 2));
    res.status(500).json(e.response?.data || { erro: e.message });
  }
});

app.get('/criar-pix', (req, res) => res.redirect(`/criar-cobv?valor=${req.query.valor || '150.00'}&dias=3`));
app.post('/webhook', (req, res) => res.sendStatus(200));
app.listen(PORT, () => console.log(`Rodando ${PORT}`));
