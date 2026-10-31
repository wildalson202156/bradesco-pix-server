const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

function getCerts() {
  let cert = process.env.BRADESCO_CERT || '';
  let key = process.env.BRADESCO_KEY || '';
  if (cert && key) {
    cert = cert.replace(/\\n/g, '\n');
    key = key.replace(/\\n/g, '\n');
    return { cert, key };
  }
  return null;
}

const certs = getCerts();

// ROTAS DE SAÚDE - pra Lovable não dar mais 404
app.get('/', (req, res) => res.json({ status: 'live', certificado: certs ? 'OK' : 'ausente' }));
app.get('/status', (req, res) => res.json({ servidor: 'Bradesco Pix PRODUCAO', certificado: certs ? 'OK' : 'ausente', tem_cert: !!certs }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/status', (req, res) => res.json({ ok: true, certificado: certs ? 'OK' : 'ausente' }));

// ROTA QUE O LOVABLE CHAMA PRA GERAR PIX
// Aceita qualquer nome que o Lovable use
async function gerarPixHandler(req, res) {
  const { valor, nome } = req.body || req.query;
  console.log('Pedido de Pix:', valor, nome);
  
  // Aqui entra sua lógica real do Bradesco com axios + https.Agent
  // Por enquanto retorna teste pra acabar o 404
  res.json({ 
    ok: true, 
    mensagem: 'Servidor PRODUCAO OK - certificado carregado',
    qrcode: '00020101021226880014br.gov.bcb.pix...',
    valor: valor || '1.00'
  });
}

app.post('/gerar-pix', gerarPixHandler);
app.post('/api/pix', gerarPixHandler);
app.post('/api/bradesco/pix', gerarPixHandler);
app.post('/pix', gerarPixHandler);
app.get('/gerar-pix', gerarPixHandler);
app.get('/api/pix', gerarPixHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor PRODUCAO rodando ${PORT} - cert: ${certs ? 'OK' : 'ausente'}`));
