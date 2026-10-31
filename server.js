const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CORREÇÃO PARA RENDER: LÊ DO ENV ---
function getCerts() {
  // 1. Tenta ler do Environment (Render)
  let cert = process.env.BRADESCO_CERT;
  let key = process.env.BRADESCO_KEY;
  
  if (cert && key) {
    // Render salva \n como texto, converte
    cert = cert.replace(/\\n/g, '\n');
    key = key.replace(/\\n/g, '\n');
    console.log('✅ Certificado carregado do Environment');
    return { cert, key };
  }
  
  // 2. Tenta ler do arquivo .p12 ou .pem local (antigo)
  const p12Path = path.join(__dirname, 'certs/bradesco.p12');
  if (fs.existsSync(p12Path)) {
    console.log('✅ Certificado carregado do arquivo .p12');
    return { p12: fs.readFileSync(p12Path) };
  }
  
  console.log('❌ CERTIFICADO AUSENTE');
  return null;
}

const certs = getCerts();

app.get('/', (req, res) => {
  res.json({ 
    status: 'live',
    certificado: certs ? 'OK' : 'ausente',
    env: process.env.BRADESCO_ENV || 'não definido'
  });
});

app.get('/status', (req, res) => {
  res.json({ 
    servidor: 'Bradesco Pix PRODUCAO',
    certificado: certs ? 'OK' : 'ausente',
    tem_cert: !!process.env.BRADESCO_CERT,
    tem_key: !!process.env.BRADESCO_KEY,
    tem_client_id: !!process.env.BRADESCO_CLIENT_ID,
    env: process.env.BRADESCO_ENV
  });
});

// ... aqui continua seu código de gerar PIX do Bradesco
// Use certs.cert e certs.key no https.Agent

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
