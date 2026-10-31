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
  const certPath = '/etc/secrets/cert.pem';
  const keyPath = '/etc/secrets/key.pem';
  
  if(!fs.existsSync(certPath) || !fs.existsSync(keyPath)){
    throw new Error('cert.pem ou key.pem não encontrado em /etc/secrets');
  }

  const cert = fs.readFileSync(certPath,'utf8');
  let key = fs.readFileSync(keyPath,'utf8');
  
  // Converte RSA ou ENCRYPTED para PKCS8 se precisar
  try{
    key = crypto.createPrivateKey({key, format:'pem'}).export({type:'pkcs8', format:'pem'}).toString();
  }catch(e){}

  return new https.Agent({cert, key, keepAlive:true});
}

async function getToken(){
  const agent = getAgent();
  const params = new URLSearchParams({grant_type:'client_credentials'});
  
  const r = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token', params, {
    httpsAgent: agent,
    auth:{
      username: process.env.BRADESCO_CLIENT_ID,
      password: process.env.BRADESCO_CLIENT_SECRET
    },
    headers:{'Content-Type':'application/x-www-form-urlencoded'}
  });
  return r.data.access_token;
}

// ROTA QUE VOCE TA TESTANDO
app.get('/gerar-pix', async (req,res)=>{
  try{
    const agent = getAgent();
    const token = await getToken();
    const valor = Number(req.query.valor||'1').toFixed(2);
    
    // Vencimento amanhã - Bradesco não aceita hoje
    const amanha = new Date(); 
    amanha.setDate(amanha.getDate()+1);
    const dataVenc = amanha.toISOString().split('T')[0];

    const body = {
      calendario:{
        dataDeVencimento: dataVenc,
        validadeAposVencimento: 1
      },
      devedor:{
        cnpj: '34340333000181',
        nome: 'DG MOTOS LTDA'
      },
      valor:{
        original: valor
      },
      chave: process.env.BRADESCO_CHAVE_PIX || '34340333000181',
      solicitacaoPagador: 'DG MOTOS'
    };

    const cob = await axios.post('https://qrpix.bradesco.com.br/v2/cobv', body, {
      httpsAgent: agent,
      headers:{Authorization:`Bearer ${token}`}
    });

    res.json({
      ok:true,
      valor: valor,
      vencimento: dataVenc,
      txid: cob.data.txid,
      pixCopiaECola: cob.data.pixCopiaECola,
      location: cob.data.location,
      bradesco: cob.data
    });

  }catch(e){
    console.log('ERRO COBV:', e.response?.status, e.response?.data || e.message);
    res.status(500).json({
      erro: e.response?.data || e.message,
      status: e.response?.status,
      url: 'https://qrpix.bradesco.com.br/v2/cobv'
    });
  }
});

// Health check
app.get('/', (req,res)=>res.send('Bradesco PIX COBV - OK - ' + new Date().toISOString()));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('RODANDO COBV na porta', PORT));
