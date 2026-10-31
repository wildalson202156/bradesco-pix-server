const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

// ROTA TESTE - pra não dar 404
app.get('/', (req,res)=>{
  res.send('API Bradesco Pix ON - use /gerar-pix?valor=1');
});

app.get('/status', (req,res)=>{
  const hasCert = fs.existsSync('/etc/secrets/cert.pem') || !!process.env.BRADESCO_CERT;
  const hasKey = fs.existsSync('/etc/secrets/key.pem') || !!process.env.BRADESCO_KEY;
  res.json({cert:hasCert, key:hasKey, clientId:!!process.env.BRADESCO_CLIENT_ID});
});

function loadPem(name, envName){
  let path = `/etc/secrets/${name}`;
  if(fs.existsSync(path)){
    let s = fs.readFileSync(path,'utf8');
    let m = s.match(/-----BEGIN[\s\S]+?-----END[\s\S]+?-----/);
    return m ? m[0] : s;
  }
  let env = process.env[envName];
  if(env){
    env = env.replace(/\\n/g,'\n');
    let m = env.match(/-----BEGIN[\s\S]+?-----END[\s\S]+?-----/);
    return m ? m[0] : env;
  }
  return null;
}

function getAgent(){
  let cert = loadPem('cert.pem','BRADESCO_CERT');
  let key = loadPem('key.pem','BRADESCO_KEY');
  if(!cert || !key) return null;
  try{
    const k = crypto.createPrivateKey({key, format:'pem'});
    key = k.export({type:'pkcs8', format:'pem'}).toString();
  }catch(e){ console.log('key convert:',e.message); }
  return new https.Agent({cert, key, rejectUnauthorized:true});
}

async function getToken(){
  const agent = getAgent();
  if(!agent) throw new Error('Certificado não encontrado em Secret Files');
  const resp = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token',
    new URLSearchParams({grant_type:'client_credentials'}),
    {
      httpsAgent: agent,
      auth:{username:process.env.BRADESCO_CLIENT_ID, password:process.env.BRADESCO_CLIENT_SECRET},
      headers:{'Content-Type':'application/x-www-form-urlencoded'}
    });
  return resp.data.access_token;
}

app.get('/gerar-pix', async (req,res)=>{
  try{
    const agent = getAgent();
    if(!agent) return res.status(500).json({erro:'Cert não carregado. Coloque cert.pem e key.pem em Secret Files'});
    const token = await getToken();
    const valor = Number(req.query.valor || '1.00').toFixed(2);
    const cob = await axios.post('https://qrpix.bradesco.com.br/v2/cob',{
      calendario:{expiracao:3600},
      valor:{original:valor},
      chave: process.env.BRADESCO_CHAVE_PIX || '34340333000181',
      solicitacaoPagador:'DG Motos'
    },{
      httpsAgent: agent,
      headers:{Authorization:`Bearer ${token}`}
    });
    res.json({ok:true, pixCopiaECola: cob.data.pixCopiaECola, txid: cob.data.txid, valor});
  }catch(e){
    res.status(500).json({erro:'Bradesco', detalhe: e.response?.data || e.message});
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Bradesco OK porta '+PORT));
