const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

function getAgent(){
  const cert = fs.readFileSync('/etc/secrets/cert.pem','utf8');
  let key = fs.readFileSync('/etc/secrets/key.pem','utf8');
  try{ key = crypto.createPrivateKey({key,format:'pem'}).export({type:'pkcs8',format:'pem'}).toString(); }catch(e){}
  return new https.Agent({cert, key, keepAlive:true});
}

async function getToken(){
  const agent = getAgent();
  const params = new URLSearchParams({grant_type:'client_credentials'});
  const r = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token', params, {
    httpsAgent: agent,
    auth:{username:process.env.BRADESCO_CLIENT_ID, password:process.env.BRADESCO_CLIENT_SECRET},
    headers:{'Content-Type':'application/x-www-form-urlencoded'}
  });
  return r.data.access_token;
}

async function criarCobranca(req,res){
  try{
    console.log("COBV PUT RODANDO");
    const agent = getAgent();
    const token = await getToken();
    const valor = Number(req.query.valor || req.body?.valor || '1').toFixed(2);
    const amanha = new Date(); amanha.setDate(amanha.getDate()+1);
    const dataVenc = amanha.toISOString().split('T')[0];
    const txid = 'DGMOTOS' + Date.now().toString().slice(-10) + crypto.randomBytes(4).toString('hex').toUpperCase();
    const body = {
      calendario:{dataDeVencimento:dataVenc, validadeAposVencimento:1},
      devedor:{cnpj:'34340333000181', nome:'DG MOTOS LTDA'},
      valor:{original:valor},
      chave: process.env.BRADESCO_CHAVE_PIX || '34340333000181',
      solicitacaoPagador:'DG MOTOS'
    };
    const cob = await axios.put(`https://qrpix.bradesco.com.br/v2/cobv/${txid}`, body, {
      httpsAgent: agent,
      headers:{Authorization:`Bearer ${token}`}
    });
    console.log("COBV PUT OK", txid);
    res.json({ok:true, valor, vencimento:dataVenc, txid, pixCopiaECola:cob.data.pixCopiaECola, bradesco:cob.data});
  }catch(e){
    console.error('COBV PUT ERRO:', e.response?.status, e.response?.data || e.message);
    res.status(500).json({erro:e.response?.data || e.message, status:e.response?.status});
  }
}

app.get('/gerar-pix', criarCobranca);
app.post('/gerar-pix', criarCobranca);
app.get('/', (req,res)=>res.send('COBV PUT OK - ' + new Date().toISOString()));
app.listen(process.env.PORT||10000, ()=>console.log('COBV PUT OK - Server live ' + new Date().toISOString()));
