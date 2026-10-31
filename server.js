const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

app.get('/',(req,res)=>res.send('API Bradesco Pix ON'));
app.get('/status',(req,res)=>{
  const c = fs.existsSync('/etc/secrets/cert.pem');
  const k = fs.existsSync('/etc/secrets/key.pem');
  res.json({cert:c,key:k,client:!!process.env.BRADESCO_CLIENT_ID});
});

function getAgent(){
  try{
    const cert = fs.readFileSync('/etc/secrets/cert.pem','utf8');
    let key = fs.readFileSync('/etc/secrets/key.pem','utf8');
    try{ 
      const pk = crypto.createPrivateKey({key,format:'pem'});
      key = pk.export({type:'pkcs8',format:'pem'}).toString();
    }catch(e){}
    return new https.Agent({cert,key, rejectUnauthorized:true});
  }catch(e){ return null; }
}

async function getToken(){
  const agent = getAgent();
  if(!agent) throw new Error('Sem cert em /etc/secrets/');
  const params = new URLSearchParams({grant_type:'client_credentials'});
  const resp = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token', params, {
    httpsAgent: agent,
    auth:{username:process.env.BRADESCO_CLIENT_ID, password:process.env.BRADESCO_CLIENT_SECRET},
    headers:{'Content-Type':'application/x-www-form-urlencoded'}
  });
  return resp.data.access_token;
}

app.get('/gerar-pix', async (req,res)=>{
  try{
    const agent = getAgent();
    const token = await getToken();
    const valor = Number(req.query.valor||'1').toFixed(2);
    const cob = await axios.post('https://qrpix.bradesco.com.br/v2/cob',{
      calendario:{expiracao:3600},
      valor:{original:valor},
      chave: process.env.BRADESCO_CHAVE_PIX || '34340333000181',
      solicitacaoPagador:'DG MOTOS'
    },{httpsAgent:agent,headers:{Authorization:`Bearer ${token}`}});
    res.json({ok:true, valor, txid:cob.data.txid, pixCopiaECola:cob.data.pixCopiaECola});
  }catch(e){
    console.log('DETALHE ERRO:', e.response?.data || e.message);
    res.status(500).json({erro: e.response?.data || e.message, url: e.config?.url});
  }
});

app.listen(process.env.PORT||10000, ()=>console.log('Bradesco PRODUCAO OK'));
