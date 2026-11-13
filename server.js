const express = require('express');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const app = express();
app.use(express.json());

const CLIENT_ID = '4b0cc39d-8e07-4c6b-9170-30fb1faa57c5';
const CLIENT_SECRET = 'f01f46db-1646-4ea7-9038-f7c4b895cc6d';

async function getToken() {
  const res = await axios.post(
    'https://api.bradesco.com.br/auth/server/v1.1/token',
    'grant_type=client_credentials',
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: new https.Agent({
        cert: fs.readFileSync('./cert.pem'),
        key: fs.readFileSync('./key.pem'),
        rejectUnauthorized: false
      })
    }
  );
  return res.data.access_token;
}

app.post('/gerar-pix', async (req, res) => {
  try {
    const { valor, txid, cliente } = req.body;
    const token = await getToken();
    
    console.log('TOKEN OK');

    const cob = await axios.put(`https://api.bradesco.com.br/v2/cob/${txid}`, {
        calendario: { expiracao: 86400 },
        devedor: { nome: cliente || 'Cliente DG Motos' },
        valor: { original: Number(valor).toFixed(2) },
        chave: '34340333000181',
        solicitacaoPagador: `DG MOTOS - R$ ${valor}`
      }, {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: new https.Agent({
          cert: fs.readFileSync('./cert.pem'),
          key: fs.readFileSync('./key.pem'),
          rejectUnauthorized: false
        })
      });
    
    console.log('PIX GERADO:', cob.data.txid);
    res.json(cob.data);

  } catch (e) {
    console.log('ERRO:', e.response?.data || e.message);
    res.status(500).json(e.response?.data || e.message);
  }
});

app.post('/webhook/bradesco', (req, res) => {
  console.log('PIX PAGO RECEBIDO:', JSON.stringify(req.body));
  // AQUI ENTRA A BAIXA AUTOMATICA NO SEU SISTEMA DG
  res.sendStatus(200);
});

app.get('/', (req,res)=> res.send('PIX EMV DG MOTOS ONLINE'));

app.listen(10000, () => console.log('Rodando 10000 - PIX EMV OK'));
