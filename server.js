const express = require('express');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const app = express();
app.use(express.json());

// COLOCA AQUI SUA CREDENCIAL NOVA DO EMV
const CLIENT_ID = 'SEU_CLIENT_ID_NOVO_DO_EMV';
const CLIENT_SECRET = 'SEU_CLIENT_SECRET_NOVO_DO_EMV';

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
    
    console.log('TOKEN OK, gerando COB...');

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
    
    console.log('PIX EMV GERADO:', cob.data.txid);
    res.json(cob.data);

  } catch (e) {
    console.log('ERRO:', e.response?.data || e.message);
    res.status(500).json(e.response?.data || e.message);
  }
});

app.post('/webhook/bradesco', (req, res) => {
  console.log('PIX PAGO:', JSON.stringify(req.body));
  res.sendStatus(200);
});

app.listen(10000, () => console.log('Rodando 10000 - PIX EMV OK'));
