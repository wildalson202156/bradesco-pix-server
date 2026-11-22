const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    // Tenta achar o certificado: 1º Secret File, 2º arquivo na pasta
    let cert, key;
    if (fs.existsSync('/etc/secrets/cert.pem')) {
      cert = fs.readFileSync('/etc/secrets/cert.pem');
      key = fs.readFileSync('/etc/secrets/key.pem');
    } else {
      cert = fs.readFileSync('./cert.pem');
      key = fs.readFileSync('./key.pem');
    }
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });

    const auth = Buffer.from(process.env.BRADESCO_CLIENT_ID + ':' + process.env.BRADESCO_CLIENT_SECRET).toString('base64');

    const tokenRes = await axios.post('https://openapi.bradesco.com.br/oauth/token',
      'grant_type=client_credentials',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + auth },
        httpsAgent: agent
      }
    );
    const token = tokenRes.data.access_token;

    const cob = await axios.post('https://openapi.bradesco.com.br/pix/v1/cob', {
      valor: { original: Number(valor).toFixed(2) },
      chave: process.env.BRADESCO_CHAVE_PIX,
      solicitacaoPagador: 'DG MOTOS - ' + nome
    }, {
      headers: { Authorization: 'Bearer ' + token },
      httpsAgent: agent
    });

    res.send(`<h2>PIX Gerado!</h2><p>Cliente: ${nome}</p><p>Valor: R$ ${valor}</p><p>Copia e Cola:</p><textarea style="width:100%;height:120px">${cob.data.pixCopiaECola || JSON.stringify(cob.data)}</textarea><br><br><a href="/">Voltar</a>`);

  } catch (e) {
    console.log(e.response?.data || e.message);
    res.send(`<h2>Erro no Bradesco</h2><pre>${JSON.stringify(e.response?.data || e.message, null, 2)}</pre><br><a href="/">Voltar</a>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
