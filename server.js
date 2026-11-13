const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const PIX_CHAVE = process.env.BRADESCO_PIX_CHAVE || '34340333000181';
const CERT_PRIVADO = process.env.BRADESCO_CERT_PRIVADO;
const CERT_PUBLICO = process.env.BRADESCO_CERT_PUBLICO;

function getAgent() {
  return new https.Agent({
    cert: CERT_PUBLICO,
    key: CERT_PRIVADO,
    rejectUnauthorized: false
  });
}

async function getToken() {
  const res = await axios.post(
    'https://api.bradesco.com.br/auth/server/v1.1/token',
    'grant_type=client_credentials',
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: getAgent()
    }
  );
  return res.data.access_token;
}

app.get('/', (req, res) => {
  res.send('PIX EMV DG MOTOS ONLINE - V2/COB');
});

app.post('/gerar-pix', async (req, res) => {
  try {
    const { valor, txid, cliente } = req.body;
    if (!valor || !txid) {
      return res.status(400).json({ erro: 'valor e txid obrigatorios' });
    }
    const token = await getToken();
    const cob = await axios.put(`https://api.bradesco.com.br/v2/cob/${txid}`, {
        calendario: { expiracao: 86400 },
        devedor: { nome: cliente || 'Cliente DG Motos' },
        valor: { original: Number(valor).toFixed(2) },
        chave: PIX_CHAVE,
        solicitacaoPagador: `DG MOTOS - R$ ${valor}`
      }, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getAgent()
      });
    res.json(cob.data);
  } catch (e) {
    console.log('ERRO GERAR PIX:', e.response?.data || e.message);
    res.status(500).json(e.response?.data || { mensagem: e.message });
  }
});

// ROTA DE TESTE FACIL - abre no navegador
app.get('/teste', async (req, res) => {
  const valor = req.query.valor || 700;
  const txid = `DGMOTOS${Date.now()}TESTE`.substring(0, 35);
  try {
    const token = await getToken();
    console.log('TOKEN OK, gerando cob', txid);
    const cob = await axios.put(`https://api.bradesco.com.br/v2/cob/${txid}`, {
        calendario: { expiracao: 86400 },
        devedor: { nome: 'CLIENTE TESTE DG' },
        valor: { original: Number(valor).toFixed(2) },
        chave: PIX_CHAVE,
        solicitacaoPagador: `DG MOTOS - R$ ${valor}`
      }, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: getAgent()
      });
    res.json({
      sucesso: true,
      mensagem: 'PIX GERADO COM SUCESSO',
      valor: valor,
      txid: txid,
      copiaECola: cob.data.pixCopiaECola || cob.data.emv,
      dados_completos: cob.data
    });
  } catch (e) {
    console.log('ERRO TESTE:', e.response?.data || e.message);
    res.status(500).json({ erro: e.response?.data || e.message });
  }
});

app.post('/webhook/bradesco', (req, res) => {
  console.log('*** PIX PAGO RECEBIDO ***', JSON.stringify(req.body));
  res.sendStatus(200);
});

app.listen(10000, () => console.log('ONLINE - PIX EMV DG MOTOS - V2/COB'));
