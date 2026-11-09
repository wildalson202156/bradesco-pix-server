const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req, res) => res.send('DG Motos PIX ON V4'));

async function getBradescoToken() {
  const cert = process.env.BRADESCO_CERT_PEM.replace(/\\n/g, '\n');
  const key = process.env.BRADESCO_KEY_PEM.replace(/\\n/g, '\n');
  const clientId = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;

  const agent = new https.Agent({ cert, key, rejectUnauthorized: false });

  // Bradesco exige Basic Auth
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const resp = await axios.post(
    'https://openapi.bradesco.com.br/parceiros/oauth/token',
    'grant_type=client_credentials',
    {
      httpsAgent: agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`
      }
    }
  );
  return resp.data.access_token;
}

app.post('/gerar-pix', async (req, res) => {
  try {
    const { calendario, valor, chave, solicitacaoPagador } = req.body;
    const cert = process.env.BRADESCO_CERT_PEM.replace(/\\n/g, '\n');
    const key = process.env.BRADESCO_KEY_PEM.replace(/\\n/g, '\n');
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });

    const token = await getBradescoToken();
    const txid = `DG${Date.now()}`.substring(0, 32);

    const payload = {
      calendario: calendario || { dataDeVencimento: "2026-11-10", validadeAposVencimento: 30 },
      valor: valor || { original: "10.00" },
      chave: chave || process.env.BRADESCO_PIX_KEY || "34340333000181",
      solicitacaoPagador: solicitacaoPagador || "DG Motos"
    };

    const resp = await axios.put(
      `https://openapi.bradesco.com.br/v2/cobv/${txid}`,
      payload,
      { httpsAgent: agent, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    res.json({ txid, pixCopiaECola: resp.data.pixCopiaECola, dados: resp.data });

  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("ERRO:", detail);
    res.status(500).json({ erro: "Falha", detalhe: detail });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando ${PORT}`));
