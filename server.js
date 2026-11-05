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
  try {
    const certPath = '/etc/secrets/cert.pem';
    const keyPath = '/etc/secrets/key.pem';
    console.log("Lendo cert:", fs.existsSync(certPath), "key:", fs.existsSync(keyPath));
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error("cert.pem ou key.pem NAO encontrado em /etc/secrets/");
    }
    const cert = fs.readFileSync(certPath,'utf8');
    let key = fs.readFileSync(keyPath,'utf8');
    console.log("Tamanhos cert:", cert.length, "key:", key.length);
    try{ key = crypto.createPrivateKey({key,format:'pem'}).export({type:'pkcs8',format:'pem'}).toString(); }catch(e){}
    return new https.Agent({cert, key, keepAlive:true, rejectUnauthorized: true});
  } catch(e){
    console.error("ERRO getAgent:", e.message);
    throw e;
  }
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

async function criarCobranca(req, res){
  try{
    console.log("COBV PUT RODANDO - query:", req.query, "body:", req.body);
    const agent = getAgent();
    const token = await getToken();
    console.log("Token OK");
    
    const valor = Number(req.query.valor || req.body?.valor || '1').toFixed(2);
    const amanha = new Date(); 
    amanha.setDate(amanha.getDate()+1);
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

    console.log("COBV PUT OK -", txid);
    res.json({ok:true, valor, vencimento:dataVenc, txid, pixCopiaECola:cob.data.pixCopiaECola, bradesco:cob.data});

  }catch(e){
    console.error('COBV PUT ERRO:', e.response?.status, JSON.stringify(e.response?.data));
    res.status(500).json({erro:e.response?.data || e.message, status:e.response?.status});
  }
}

// ACEITA GET E POST - corrige o Cannot POST
app.get('/gerar-pix', criarCobranca);
app.post('/gerar-pix', criarCobranca);

app.get('/', (req,res)=>res.send('COBV PUT OK - ' + new Date().toISOString()));

app.listen(process.env.PORT||10000, ()=>console.log('COBV PUT OK - Server live ' + new Date().toISOString()));
