const fs = require('fs');
const axios = require('axios');
const https = require('https');

app.post('/gerar-pix', async (req, res) => {
  try {
    const valor = req.body.valor;
    const nome = req.body.nomeCliente;

    // 1. Conecta no Bradesco e pega o token
    const agent = new https.Agent({
      cert: fs.readFileSync('./cert.pem'),
      key: fs.readFileSync('./key.pem'),
    });

    const auth = Buffer.from(process.env.BRADESCO_CLIENT_ID + ':' + process.env.BRADESCO_CLIENT_SECRET).toString('base64');

    const tokenRes = await axios.post('https://openapi.bradesco.com.br/oauth/token', 'grant_type=client_credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + auth },
      httpsAgent: agent
    });

    const token = tokenRes.data.access_token;

    // 2. Gera a cobrança PIX
    const cob = await axios.post('https://openapi.bradesco.com.br/pix/v1/cob', {
      valor: { original: Number(valor).toFixed(2) },
      chave: process.env.BRADESCO_CHAVE_PIX,
      solicitacaoPagador: 'DG MOTOS - ' + nome
    }, {
      headers: { Authorization: 'Bearer ' + token },
      httpsAgent: agent
    });

    res.send(`<h2>PIX Gerado!</h2><p>Cliente: ${nome}</p><p>Valor: R$ ${valor}</p><p>Copia e Cola:</p><textarea style="width:100%;height:100px">${cob.data.pixCopiaECola || JSON.stringify(cob.data)}</textarea><br><a href="/">Voltar</a>`);
    
  } catch (e) {
    res.send(`<h2>Erro no Bradesco</h2><p>${e.response?.data?.mensagem || e.message}</p><a href="/">Voltar</a>`);
  }
});
