const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

// ROTA INICIAL - pra não dar 404
app.get('/', (req,res)=>{
  res.send('API Bradesco Pix ON - use /gerar-pix?valor=1');
});

app.get('/status', (req,res)=>{
  const hasCert = fs.existsSync('/etc/secrets/cert.pem') || !!process.env.BRADESCO_CERT;
  const hasKey = fs.existsSync('/etc/secrets/key.pem') || !!process.env.BRADESCO_KEY;
  res.json({
    cert: hasCert,
    key: hasKey,
    clientId: !!process.env.BRADESCO_CLIENT_ID,
    clientId_valor: process.env.BRADESCO_CLIENT_ID ? process.env.BRADESCO_CLIENT_ID.substring(0,8)+'...' : null
  });
});

function loadPem(name, envName){
  let filePath = `/etc/secrets/${name}`;
  if(fs.existsSync(filePath)){
    let content = fs.readFileSync(filePath,'utf8');
    let m = content.match(/-----BEGIN[\s\S]+?-----END[\s\S]+?-----/);
    return m ? m[0] : content;
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
  if(!cert || !key){
    console.log('Cert ou Key não encontrado');
    return null;
  }
  try{
    const privateKeyObj = crypto.createPrivateKey({key, format:'pem'});
    key = privateKeyObj.export({type:'pkcs8', format:'pem'}).toString();
  }catch(e){
    console.log('Aviso key:', e.message);
  }
  return new https.Agent({cert, key});
}

async function getToken(){
  const agent = getAgent();
  if(!agent) throw new Error('Certificado não encontrado em /etc/secrets/cert.pem e /etc/secrets/key.pem');
  
  // BRADESCO NÃO ACEITA SCOPE NO TOKEN - deixa só grant_type
  const params = new URLSearchParams({
    grant_type:'client_credentials'
  });

  const resp = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token',
    params,
    {
      httpsAgent: agent,
      auth:{
        username: process.env.BRADESCO_CLIENT_ID,
        password: process.env.BRADESCO_CLIENT_SECRET
      },
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
    
    res.json({
      ok:true,
      valor: valor,
      txid: cob.data.txid,
      pixCopiaECola: cob.data.pixCopiaECola,
      location: cob.data.location
    });
    
  }catch(e){
    console.error('Erro Bradesco:', e.response?.data || e.message);
    res.status(500).json({
      erro:'Bradesco',
      detalhe: e.response?.data || e.message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Bradesco Pix OK na porta '+PORT));
