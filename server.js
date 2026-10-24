const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

function getAgent() {
  const pfxBase64 = process.env.PFX_BASE64;
  const pfxPass = process.env.PFX_SENHA || '';
  const pfxBuffer = Buffer.from(pfxBase64, 'base64');
  return new https.Agent({
    pfx: pfxBuffer,
    passphrase: pfxPass,
    rejectUnauthorized: true
  });
}

app.get('/', (req,res)=> res.send('DG MOTOS - Bradesco Proxy OK'));

app.post('/token', async (req,res)=>{
  try {
    const agent = getAgent();
    const params = new URLSearchParams();
    params.append('grant_type','client_credentials');
    const resp = await axios.post('https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token', params, {
      httpsAgent: agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      auth: {
        username: process.env.CLIENT_ID,
        password: process.env.CLIENT_SECRET
      }
    });
    res.json(resp.data);
  } catch(e){
    res.status(e.response?.status || 500).json({ error: e.response?.data || e.message });
  }
});

app.listen(process.env.PORT || 3000, ()=> console.log('rodando'));
