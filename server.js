const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Variáveis que você colocou no Render
const PFX_BASE64 = process.env.PFX_BASE64;
const PFX_SENHA = process.env.PFX_SENHA || '';
const CLIENT_ID = process.env.CLIENT_ID || process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.BRADESCO_CLIENT_SECRET;

// ENDEREÇOS NOVOS DO BRADESCO SANDBOX - CORRIGIDO
const TOKEN_URL = 'https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token';
const PIX_BASE_URL = 'https://openapisandbox.prebanco.com.br';

function getAgent() {
  if (!PFX_BASE64) {
    throw new Error('PFX_BASE64 não configurado no Render');
  }
  const pfxBuffer = Buffer.from(PFX_BASE64, 'base64');
  return new https.Agent({
    pfx: pfxBuffer,
    passphrase: PFX_SENHA,
    rejectUnauthorized: false,
  });
}

// Health check
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'DG MOTOS - Bradesco Proxy OK', cert: !!PFX_BASE64 });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, cert: !!PFX_BASE64, hasClientId: !!CLIENT_ID });
});

// Pega token no Bradesco
app.get('/token', async (req, res) => {
  try {
    const agent = getAgent();
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const response = await axios.post(TOKEN_URL, params, {
      httpsAgent: agent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    res.json(response.data);
  } catch (e) {
    console.error('Erro token:', e.response?.data || e.message);
    res.status(500).json({ error: true, details: e.response?.data || e.message });
  }
});

// Cria cobrança Pix
app.post('/pix', async (req, res) => {
  try {
    const agent = getAgent();
    
    // 1. Pega token
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const tokenResp = await axios.post(TOKEN_URL, params, {
      httpsAgent: agent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const accessToken = tokenResp.data.access_token;

    // 2. Cria Pix
    const pixResp = await axios.post(`${PIX_BASE_URL}/v2/cob`, req.body, {
      httpsAgent: agent,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(pixResp.data);
  } catch (e) {
    console.error('Erro pix:', e.response?.data || e.message);
    res.status(500).json({ error: true, details: e.response?.data || e.message });
  }
});

// Consulta Pix por txid
app.get('/pix/:txid', async (req, res) => {
  try {
    const agent = getAgent();
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const tokenResp = await axios.post(TOKEN_URL, params, {
      httpsAgent: agent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const accessToken = tokenResp.data.access_token;

    const pixResp = await axios.get(`${PIX_BASE_URL}/v2/cob/${req.params.txid}`, {
      httpsAgent: agent,
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    res.json(pixResp.data);
  } catch (e) {
    console.error('Erro consulta:', e.response?.data || e.message);
    res.status(500).json({ error: true, details: e.response?.data || e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
