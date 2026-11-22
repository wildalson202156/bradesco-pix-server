const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const TOKEN_URL = process.env.BRADESCO_TOKEN_URL || 'https://openapi.bradesco.com.br/oauth/token';
const COBV_URL = process.env.BRADESCO_COBV_URL || 'https://openapi.bradesco.com.br/pix/v1/cobv';
const CHAVE_PIX = process.env.BRADESCO_CHAVE_PIX || process.env.BRADESCO_PIX_CHAVE;

function getAgent() {
  let cert = process.env.BRADESCO_CERT_PEM || '';
  let key = process.env.BRADESCO_KEY_PEM || '';
  if (cert) cert = cert.replace(/\\n/g, '\n').trim();
  if (key) key = key.replace(/\\n/g, '\n').trim();
  return new https.Agent({ cert, key, rejectUnauthorized: true });
}

async function getToken() {
  const agent = getAgent();
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  try {
    const res = await axios.post(TOKEN_URL, new URLSearchParams({ grant_type: 'client_credentials' }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`
      },
      httpsAgent: agent
    });
    return res.data.access_token;
  } catch (e) {
    console.log('TOKEN STATUS:', e.response?.status);
    console.log('TOKEN ERRO:', JSON.stringify(e.response?.data));
    console.log('TOKEN MSG:', e.message);
    throw e;
  }
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarEMV(chave, txid, valor, nome, cidade) {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  let gui = f('00', 'BR.GOV.BCB.PIX') + f('01', chave);
  let payload = f('00', '02') + f('26', gui) + f('52', '0000') + f('53', '986') + f('54', Number(valor).toFixed(2)) + f('58', 'BR') + f('59', nome.substring(0, 25)) + f('60', cidade.substring(0, 15)) + f('62', f('05', txid));
  payload += '6304';
  payload += crc16(payload);
  return payload;
}

app.get('/', (req, res) => {
  res.send('Bradesco Pix Server OK');
});

app.post('/gerar-pix', async (req, res) => {
  try {
    const { valor, nome, cpf } = req.body;
    if (!valor) return res.status(400).json({ erro: 'Valor obrigatorio' });

    const token = await getToken();
    const agent = getAgent();

    const txid = 'BRAD' + Date.now().toString().slice(-12) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const valorFormatado = Number(valor).toFixed(2);

    const body = {
      calendario: { expiracao: 3600 },
      devedor: {
        cpf: String(cpf || '00000000000').replace(/\D/g, ''),
        nome: nome || 'Cliente'
      },
      valor: { original: valorFormatado },
      chave: CHAVE_PIX,
      solicitacaoPagador: 'Pagamento via Pix'
    };

    console.log('ENVIANDO COBV TXID:', txid, 'VALOR:', valorFormatado);

    const cobv = await axios.put(`${COBV_URL}/${txid}`, body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: agent
    });

    const location = cobv.data?.loc?.location || cobv.data?.location || '';
    const emv = gerarEMV(CHAVE_PIX, txid, valorFormatado, 'SUA EMPRESA', 'SAO LUIS');

    res.json({
      txid,
      copiaCola: emv,
      qrCodeUrl: location,
      valor: valorFormatado,
      status: cobv.data?.status || 'ATIVA'
    });

  } catch (err) {
    console.log('ERRO COBV STATUS:', err.response?.status);
    console.log('ERRO COBV DATA:', JSON.stringify(err.response?.data));
    console.log('ERRO COBV MSG:', err.message);
    res.status(err.response?.status || 500).json({
      erro: 'Falha ao gerar Pix',
      status: err.response?.status,
      detalhe: err.response?.data || err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
