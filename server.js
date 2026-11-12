const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 10000;

function getAgent() {
  // AGORA SEPARADO - CORRIGE O ERRO 117
  return new https.Agent({
    cert: process.env.BRADESCO_CERT_PUBLICO,
    key: process.env.BRADESCO_CERT_PRIVADO,
    rejectUnauthorized: false
  });
}

async function getToken() {
  console.log("Tentando TOKEN...");
  const agent = getAgent();
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  const res = await axios.post(`${process.env.BRADESCO_BASE_URL}/oauth/token`, params, {
    httpsAgent: agent,
    auth: { username: process.env.BRADESCO_CLIENT_ID, password: process.env.BRADESCO_CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  console.log("TOKEN OK");
  return res.data.access_token;
}

app.get('/criar-cobv', async (req, res) => {
  try {
    const valor = req.query.valor || "150.00";
    const dias = parseInt(req.query.dias) || 3;
    const venc = new Date(); venc.setDate(venc.getDate() + dias);
    const dataVenc = venc.toISOString().split('T')[0];
    const token = await getToken();
    const agent = getAgent();
    const payload = {
      calendario: { dataDeVencimento: dataVenc, validadeAposVencimento: 30 },
      valor: { original: valor.toString() },
      chave: process.env.BRADESCO_PIX_CHAVE,
      solicitacaoPagador: `DG MOTOS - Venc ${dataVenc}`
    };
    const response = await axios.post(`${process.env.BRADESCO_BASE_URL}/v2/cobv`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });
    res.json({ success: true, tipo: "PIX DINAMICO COM VENCIMENTO", valor, vencimento: dataVenc, pixCopiaECola: response.data.pixCopiaECola, txid: response.data.txid, dados: response.data });
  } catch (e) {
    console.error("ERRO:", e.response?.data || e.message);
    res.status(500).json(e.response?.data || { erro: e.message });
  }
});

app.get('/', (req, res) => res.send('DG MOTOS - PIX COM VENCIMENTO DINAMICO ONLINE'));
app.listen(PORT, () => console.log(`Rodando ${PORT}`));
