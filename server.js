const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CONFIG ---
const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const CHAVE_PIX = process.env.BRADESCO_CHAVE_PIX;
const TOKEN_URL = process.env.BRADESCO_TOKEN_URL || 'https://openapi.bradesco.com.br/oauth/token';
const COBV_URL = process.env.BRADESCO_COBV_URL || 'https://openapi.bradesco.com.br/pix/v1/cobv';

function getAgent() {
  // Pega do ENV ou do arquivo se tiver no GitHub
  let cert = process.env.BRADESCO_CERT_PEM;
  let key = process.env.BRADESCO_KEY_PEM;
  try {
    if (!cert && fs.existsSync('./cert.pem')) cert = fs.readFileSync('./cert.pem', 'utf8');
    if (!key && fs.existsSync('./key.pem')) key = fs.readFileSync('./key.pem', 'utf8');
  } catch(e) {}
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

async function getToken() {
  const agent = getAgent();
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${basic}` },
    httpsAgent: agent
  });
  return res.data.access_token;
}
// --- TELA ---
app.get('/', (req, res) => {
  res.send(`
    <h2>PIX PARAMETRIZADO - DG MOTOS</h2>
    <form action="/gerar-pix" method="POST">
      <input name="valor" placeholder="Valor ex: 500" required><br><br>
      <input name="nomeCliente" placeholder="Nome do cliente" required><br><br>
      <input name="cpf" placeholder="CPF do cliente (só números)"><br><br>
      <label>Vencimento:</label><br>
      <input type="date" name="vencimento" required><br><br>
      <input name="desconto" placeholder="Desconto se pagar antes ex: 10 (opcional)"><br><br>
      <button type="submit">Gerar PIX com Vencimento</button>
    </form>
    <br><a href="/consultar">Consultar pagamento</a>
  `);
});

// --- GERAR COBV ---
app.post('/gerar-pix', async (req, res) => {
  try {
    const { valor, nomeCliente, cpf, vencimento, desconto } = req.body;
    const token = await getToken();
    const txid = 'DG' + Date.now().toString().slice(-20).replace(/[^A-Za-z0-9]/g, '') + Math.floor(Math.random()*1000);
    // txid tem que ter 26 a 35 caracteres
    const txidFinal = (txid + 'ABCDEFGHIJ').substring(0, 32);

    const body = {
      calendario: {
        dataDeVencimento: vencimento,
        validadeAposVencimento: 30
      },
      devedor: {
        cpf: cpf ? cpf.replace(/\D/g,'') : undefined,
        nome: nomeCliente
      },
      valor: {
        original: Number(valor).toFixed(2),
        multa: { modalidade: 2, valorPerc: '2.00' },
        juros: { modalidade: 2, valorPerc: '1.00' },
        desconto: desconto ? { modalidade: 1, valorPerc: Number(desconto).toFixed(2) } : { modalidade: 0, valorPerc: '0.00' }
      },
      chave: CHAVE_PIX,
      solicitacaoPagador: `DG MOTOS - ${nomeCliente} - Venc ${vencimento}`
    };

    const agent = getAgent();
    const resp = await axios.put(`${COBV_URL}/${txidFinal}`, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      httpsAgent: agent
    });

    const copiaCola = resp.data.pixCopiaECola || resp.data.emv || '';
    res.send(`
      <h2>PIX Gerado - DG MOTOS</h2>
      <p>Cliente: ${nomeCliente}</p>
      <p>Valor: R$ ${valor}</p>
      <p>Vencimento: ${vencimento}</p>
      <p>TXID: ${txidFinal}</p>
      <p>Copia e Cola:</p>
      <textarea style="width:100%;height:140px" onclick="this.select()">${copiaCola}</textarea><br><br>
      <button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value);alert('Copiado!')">Copiar</button>
      <br><br><a href="/">Gerar outro</a> | <a href="/consultar?txid=${txidFinal}">Ver se pagou</a>
    `);
  } catch (err) {
   console.log('ERRO COBV STATUS:', err.response?.status);
console.log('ERRO COBV DATA:', JSON.stringify(err.response?.data));
console.log('ERRO COBV MSG:', err.message);
    res.send(`<h2>Erro ao gerar</h2><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre><br><a href="/">Voltar</a>`);
  }
});

// --- CONSULTAR SE PAGOU ---
app.get('/consultar', async (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.send(`<h2>Consultar</h2><form><input name="txid" placeholder="TXID"><button>Consultar</button></form>`);
  try {
    const token = await getToken();
    const agent = getAgent();
    const resp = await axios.get(`${COBV_URL}/${txid}`, { headers: { Authorization: `Bearer ${token}` }, httpsAgent: agent });
    res.send(`<h2>Status: ${resp.data.status}</h2><pre>${JSON.stringify(resp.data, null, 2)}</pre><br><a href="/">Voltar</a>`);
  } catch(e) {
    res.send(`Erro: ${JSON.stringify(e.response?.data || e.message)}`);
  }
});

// --- WEBHOOK ---
app.post('/webhook-pix', (req, res) => {
  console.log('WEBHOOK COBV:', JSON.stringify(req.body));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('PARAMETRIZADO rodando ' + PORT));
