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
  return new https.Agent({cert,key});
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

app.get('/gerar-pix', async (req,res)=>{
  try{
    const agent = getAgent();
    const token = await getToken();
    const valor = Number(req.query.valor||'1').toFixed(2);
    
    // DATA DE VENCIMENTO AMANHA
    const amanha = new Date(); amanha.setDate(amanha.getDate()+1);
    const dataVenc = amanha.toISOString().split('T')[0]; // YYYY-MM-DD

    const cob = await axios.post('https://qrpix.bradesco.com.br/v2/cobv',{
      calendario:{dataDeVencimento:dataVenc, validadeAposVencimento:0},
      valor:{original:valor},
      chave: process.env.BRADESCO_CHAVE_PIX || '34340333000181',
      solicitacaoPagador:'DG MOTOS'
    },{httpsAgent:agent,headers:{Authorization:`Bearer ${token}`}});

    res.json({ok:true, valor, vencimento:dataVenc, txid:cob.data.txid, pixCopiaECola:cob.data.pixCopiaECola, location:cob.data.location});

  }catch(e){
    console.log(e.response?.data || e.message);
    res.status(500).json({erro: e.response?.data || e.message});
  }
});

app.listen(process.env.PORT||10000, ()=>console.log('COBV OK'));
