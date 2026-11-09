const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req, res) => res.send('Bradesco PIX Server ON - DG Motos V3'));

async function getBradescoToken() {
  const cert = process.env.BRADESCO_CERT_PEM;
  const key = process.env.BRADESCO_KEY_PEM;

  const agent = new https.Agent({ cert, key, rejectUnauthorized: false });

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.BRADESCO_CLIENT_ID);
  params.append('client_secret', process.env.BRADESCO_CLIENT_SECRET);

  // URL NOVA CORRETA
  const resp = await axios.post(
    'https://openapi.bradesco.com.br/parceiros/oauth/token',
    params,
    { httpsAgent: agent, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return resp.data.access_token;
}

app.post('/gerar-pix', async (req, res) => {
  try {
    const { calendario, valor, chave, solicitacaoPagador } = req.body;
    const cert = process.env.BRADESCO_CERT_PEM;
    const key = process.env.BRADESCO_KEY_PEM;
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });

    const token = await getBradescoToken();
    const txid = `DG${Date.now()}`.substring(0, 32);

    const payload = {
      calendario: calendario || { dataDeVencimento: "2026-11-10", validadeAposVencimento: 30 },
      valor: valor,
      chave: chave || process.env.BRADESCO_PIX_KEY || "34340333000181",
      solicitacaoPagador: solicitacaoPagador || "DG Motos"
    };

    const resp = await axios.put(
      `https://openapi.bradesco.com.br/v2/cobv/${txid}`,
      payload,
      { httpsAgent: agent, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    res.json({ txid, pixCopiaECola: resp.data.pixCopiaECola, dadosBradesco: resp.data });

  } catch (err) {
    console.error("ERRO:", err.response ? err.response.data : err.message);
    res.status(500).json({ erro: "Falha ao gerar PIX", detalhe: err.response ? err.response.data : err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando ${PORT}`));
