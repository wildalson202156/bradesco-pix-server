const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.BRADESCO_CLIENT_ID;
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET;
const TOKEN_URL_ENV = process.env.BRADESCO_TOKEN_URL || 'https://openapi.bradesco.com.br/oauth/token';
const COBV_URL = process.env.BRADESCO_COBV_URL || 'https://openapi.bradesco.com.br/pix/v1/cobv';
const CHAVE_PIX = process.env.BRADESCO_CHAVE_PIX || process.env.BRADESCO_PIX_CHAVE;

function getCertKey() {
  let cert = process.env.BRADESCO_CERT_PEM || '';
  let key = process.env.BRADESCO_KEY_PEM || '';
  if (cert) {
    cert = cert.replace(/\\n/g, '\n').trim();
    cert = cert.replace(/CERTIFICADO/g, 'CERTIFICATE');
    cert = cert.replace(/-----BEGIN CERTIFICATE-----/, '-----BEGIN CERTIFICATE-----');
  }
  if (key) key = key.replace(/\\n/g, '\n').trim();
  return { cert, key };
}

function getAgent() {
  const { cert, key } = getCertKey();
  return new https.Agent({ cert, key, rejectUnauthorized: true });
}

async function getToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const url = TOKEN_URL_ENV;
  console.log('TOKEN_URL DO RENDER:', url);
  try {
    console.log('TENTANDO TOKEN EM:', url);
    const res = await axios.post(url, new URLSearchParams({ grant_type: 'client_credentials' }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`
      }
    });
    console.log('TOKEN OK EM:', url);
    return res.data.access_token;
  } catch (e) {
    console.log('TOKEN FALHOU EM:', url, 'STATUS:', e.response?.status, 'DATA:', JSON.stringify(e.response?.data));
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

app.get('/debug', (req, res) => {
  const { cert, key } = getCertKey();
  let certInfo = 'SEM CERT';
  try {
    if (cert) {
      const x = new crypto.X509Certificate(cert);
      certInfo = 'Valido de ' + x.validFrom + ' ate ' + x.validTo + ' | Subject: ' + x.subject;
    }
  } catch (e) { certInfo = 'CERT QUEBRADO: ' + e.message; }
  res.json({
    tokenUrl: TOKEN_URL_ENV,
    cobvUrl: COBV_URL,
    temClientId: !!CLIENT_ID,
    clientIdInicio: CLIENT_ID ? CLIENT_ID.substring(0, 4) + '...' : null,
    temSecret: !!CLIENT_SECRET,
    temChavePix: !!CHAVE_PIX,
    chavePix: CHAVE_PIX || null,
    certComecaCom: cert ? cert.substring(0, 35) : null,
    certTerminaCom: cert ? cert.substring(cert.length - 35) : null,
    certInfo,
    certTamanho: cert.length,
    keyTamanho: key.length
  });
});

app.get('/pagamento', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pagamento Pix</title>
<style>body{font-family:Arial,sans-serif;background:#f2f2f2;display:flex;justify-content:center;padding:20px} .card{background:#fff;padding:24px;border-radius:12px;width:100%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.1)} h2{text-align:center} label{display:block;margin-top:12px;font-weight:bold} input{width:100%;padding:12px;margin-top:6px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box} button{width:100%;padding:14px;margin-top:18px;background:#cc0000;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer} #resultado{margin-top:20px;display:none} textarea{width:100%;height:110px;padding:10px;box-sizing:border-box} .copiar{background:#000;margin-top:8px}</style>
</head>
<body><div class="card"><h2>Pagamento via Pix</h2>
<label>Nome</label><input id="nome" placeholder="Seu nome">
<label>CPF</label><input id="cpf" placeholder="Somente numeros">
<label>Valor R$</label><input id="valor" type="number" step="0.01" placeholder="Ex: 10.00" value="1.00">
<button onclick="gerar()">GERAR PIX</button>
<div id="resultado"><p><b>Pix gerado! Copie abaixo:</b></p><textarea id="copia" readonly></textarea><button class="copiar" onclick="copiar()">COPIAR CODIGO</button><p id="txid"></p></div>
<p id="msg" style="color:red;text-align:center"></p>
</div>
<script>
async function gerar(){
  const nome=document.getElementById('nome').value;
  const cpf=document.getElementById('cpf').value;
  const valor=document.getElementById('valor').value;
  document.getElementById('msg').innerText='Gerando... aguarde';
  try{
    const r=await fetch('/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,cpf,valor})});
    const d=await r.json();
    if(d.copiaCola){
      document.getElementById('resultado').style.display='block';
      document.getElementById('copia').value=d.copiaCola;
      document.getElementById('txid').innerText='TXID: '+d.txid;
      document.getElementById('msg').innerText='Pronto!';
    } else { document.getElementById('msg').innerText='Erro: '+(d.detalhe ? JSON.stringify(d.detalhe) : d.erro); }
  }catch(e){ document.getElementById('msg').innerText='Erro ao gerar: '+e.message; }
}
function copiar(){ const t=document.getElementById('copia'); t.select(); document.execCommand('copy'); alert('Copiado!'); }
</script></body></html>`);
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
      devedor: { cpf: String(cpf || '00000000000').replace(/\D/g, ''), nome: nome || 'Cliente' },
      valor: { original: valorFormatado },
      chave: CHAVE_PIX,
      solicitacaoPagador: 'Pagamento via Pix'
    };
    console.log('ENVIANDO COBV TXID:', txid, 'VALOR:', valorFormatado);
    const cobv = await axios.put(`${COBV_URL}/${txid}`, body, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      httpsAgent: agent
    });
    const location = cobv.data?.loc?.location || cobv.data?.location || '';
    const emv = gerarEMV(CHAVE_PIX, txid, valorFormatado, 'SUA EMPRESA', 'SAO LUIS');
    res.json({ txid, copiaCola: emv, qrCodeUrl: location, valor: valorFormatado, status: cobv.data?.status || 'ATIVA' });
  } catch (err) {
    console.log('ERRO COBV STATUS:', err.response?.status);
    console.log('ERRO COBV DATA:', JSON.stringify(err.response?.data));
    console.log('ERRO COBV MSG:', err.message);
    res.status(err.response?.status || 500).json({ erro: 'Falha ao gerar Pix', status: err.response?.status, detalhe: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
