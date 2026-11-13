const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const PIX_CHAVE = process.env.BRADESCO_PIX_CHAVE;
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

app.post('/gerar-pix', async (req, res) => {
  try {
    const { valor, txid, cliente } = req.body;
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
    console.log(e.response?.data || e.message);
    res.status(500).json(e.response?.data || e.message);
  }
});

app.post('/webhook/bradesco', (req,res)=>{
  console.log('PIX PAGO:', JSON.stringify(req.body));
  res.sendStatus(200);
});

app.get('/', (req,res)=> res.send('PIX EMV DG MOTOS ONLINE - V2/COB'));

app.listen(10000, ()=> console.log('ONLINE'));
