const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CERT = process.env.BRADESCO_CERT_PEM;
const KEY = process.env.BRADESCO_KEY_PEM;
const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const PIX_KEY = process.env.BRADESCO_PIX_KEY;

const BASE_URL = 'https://qrpix.bradesco.com.br';

function getAgent() {
  if (!CERT || !KEY) throw new Error('Certificado não configurado');
  return new https.Agent({
    cert: CERT,
    key: KEY,
    rejectUnauthorized: true
  });
}

async function getToken() {
  const agent = getAgent();
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  const resp = await axios.post(`${BASE_URL}/oauth/token`, params, {
    httpsAgent: agent,
    auth: { username: CLIENT_ID, password: CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data.access_token;
}

// TESTE: Página inicial pra você gerar QR Code
app.get('/', (req, res) => {
  res.send(`
    <h1>DG MOTOS - PIX Bradesco PROD V10</h1>
    <p>Status: ${CERT ? 'Certificado OK' : 'SEM CERTIFICADO'}</p>
    <p>Chave PIX: ${PIX_KEY ? PIX_KEY.substring(0,10)+'...' : 'não configurada'}</p>
    <hr>
    <h3>Gerar PIX com valor:</h3>
    <form method="POST" action="/pix/criar">
      Valor: <input name="valor" value="1.00" /> <br><br>
      Nome Cliente: <input name="nome" value="Cliente Teste" /> <br><br>
      <button type="submit">GERAR QR CODE REAL</button>
    </form>
    <hr>
    <a href="/pix/registrar-webhook">Clique aqui para REGISTRAR WEBHOOK</a>
  `);
});

// CRIAR PIX COM VALOR
app.post('/pix/criar', async (req, res) => {
  try {
    const valor = req.body.valor || req.query.valor || '1.00';
    const nome = req.body.nome || 'DG Motos Cliente';
    console.log(`Gerando PIX de R$ ${valor} para ${nome}`);

    const token = await getToken();
    const agent = getAgent();
    
    const txid = 'DG' + Date.now().toString().slice(-26);
    
    const cob = {
      calendario: { expiracao: 3600 },
      devedor: { nome: nome.substring(0,100) },
      valor: { original: parseFloat(valor).toFixed(2) },
      chave: PIX_KEY,
      solicitacaoPagador: `DG Motos - ${nome}`
    };

    const resp = await axios.put(`${BASE_URL}/v2/cob/${txid}`, cob, {
      httpsAgent: agent,
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('PIX criado:', resp.data.pixCopiaECola);
    res.json({
      sucesso: true,
      txid: txid,
      valor: valor,
      copiaECola: resp.data.pixCopiaECola,
      qrCodeBase64: resp.data.imagemQrcode || null,
      dados: resp.data
    });

  } catch (e) {
    console.error('ERRO AO CRIAR PIX:', e.response?.data || e.message);
    res.status(500).json({ erro: e.response?.data || e.message });
  }
});

// WEBHOOK - Recebe aviso de pagamento do Bradesco
app.post('/pix/webhook', (req, res) => {
  console.log('=== PIX PAGO! ===', JSON.stringify(req.body));
  // AQUI VOCÊ COLOCA A BAIXA AUTOMÁTICA NO SEU SISTEMA DG MOTOS
  res.sendStatus(200);
});

app.get('/pix/webhook', (req, res) => {
  res.send('Webhook DG Motos ativo: https://bradesco-pix-server.onrender.com/pix/webhook');
});

// REGISTRAR WEBHOOK NO BRADESCO
app.get('/pix/registrar-webhook', async (req, res) => {
  try {
    const token = await getToken();
    const agent = getAgent();
    const webhookUrl = 'https://bradesco-pix-server.onrender.com/pix/webhook';
    
    const resp = await axios.put(`${BASE_URL}/v2/webhook/${PIX_KEY}`, 
      { webhookUrl: webhookUrl },
      { httpsAgent: agent, headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Webhook registrado:', resp.data);
    res.json({ sucesso: true, mensagem: 'Webhook registrado no Bradesco!', url: webhookUrl, retorno: resp.data });
  } catch (e) {
    console.error('ERRO WEBHOOK:', e.response?.data || e.message);
    res.status(500).json({ erro: e.response?.data || e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DG MOTOS V10 PROD rodando na porta ${PORT}`));
