const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function pegarToken(agent, auth) {
  return new Promise((resolve, reject) => {
    const data = 'grant_type=client_credentials';
    const req = https.request({
      hostname: 'openapi.bradesco.com.br',
      path: '/oauth/token',
      method: 'POST',
      agent: agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': 'Basic ' + auth
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        console.log('TOKEN STATUS:', res.statusCode);
        console.log('TOKEN BODY:', body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error('Token falhou ' + res.statusCode + ' - ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.get('/', (req, res) => {
  res.send(`
    <h2>PIX EMV DG MOTOS ONLINE - V2/COB</h2>
    <p>Servidor online!</p>
    <form action="/gerar-pix" method="POST">
      <input name="valor" placeholder="Valor ex: 100" required><br><br>
      <input name="nomeCliente" placeholder="Nome do cliente" required><br><br>
      <button type="submit">Gerar PIX</button>
    </form>
  `);
});

app.post('/gerar-pix', async (req, res) => {
  try {
    const valor = req.body.valor;
    const nome = req.body.nomeCliente;

    let cert, key;
    if (fs.existsSync('/etc/secrets/cert.pem')) {
      cert = fs.readFileSync('/etc/secrets/cert.pem');
      key = fs.readFileSync('/etc/secrets/key.pem');
    } else {
      cert = fs.readFileSync('./cert.pem');
      key = fs.readFileSync('./key.pem');
    }
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });
    const auth = Buffer.from((process.env.BRADESCO_CLIENT_ID || '').trim() + ':' + (process.env.BRADESCO_CLIENT_SECRET || '').trim()).toString('base64');

    const tokenData = await pegarToken(agent, auth);
    const token = tokenData.access_token;

    const cob = await axios.post('https://openapi.bradesco.com.br/pix/v1/cob', {
      valor: { original: Number(valor).toFixed(2) },
      chave: (process.env.BRADESCO_CHAVE_PIX || '').trim(),
      solicitacaoPagador: 'DG MOTOS - ' + nome
    }, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      httpsAgent: agent
    });

    res.send(`<h2>PIX Gerado!</h2><p>Cliente: ${nome}</p><p>Valor: R$ ${valor}</p><p>Copia e Cola:</p><textarea style="width:100%;height:120px">${cob.data.pixCopiaECola || JSON.stringify(cob.data)}</textarea><br><br><a href="/">Voltar</a>`);
  } catch (e) {
    console.log('ERRO FINAL:', e.message);
    res.send(`<h2>Erro no Bradesco</h2><pre>${e.message}</pre><br><a href="/">Voltar</a>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
