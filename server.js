const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

function getAgent(){
  let cert = (process.env.BRADESCO_CERT||'').replace(/\\n/g,'\n').trim();
  let key = (process.env.BRADESCO_KEY||'').replace(/\\n/g,'\n').trim();
  if(!cert.includes('BEGIN CERTIFICATE') || !key.includes('PRIVATE KEY')){
    console.log('CERT ou KEY incompleto');
    return null;
  }
  return new https.Agent({ cert, key, keepAlive:true });
}

async function getToken(){
  const agent = getAgent();
  if(!agent) throw new Error('Certificado nao carregado');
  const id = process.env.BRADESCO_CLIENT_ID;
  const secret = process.env.BRADESCO_CLIENT_SECRET;
  const resp = await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token',
    new URLSearchParams({grant_type:'client_credentials'}),
    {
      httpsAgent: agent,
      auth: { username: id, password: secret },
      headers: { 'Content-Type':'application/x-www-form-urlencoded' }
    }
  );
  return resp.data.access_token;
}

app.get('/', (req,res)=>res.json({status:'PRODUCAO PEM OK', cert: getAgent()?'OK':'erro'}));

app.get('/gerar-pix', async (req,res)=>{
  try{
    const valor = req.query.valor || '1.00';
    const agent = getAgent();
    if(!agent) return res.status(500).json({error:'Cert nao carregado'});
    const token = await getToken();
    const chave = process.env.BRADESCO_CHAVE_PIX || '34340333000181';
    const cob = await axios.post('https://qrpix.bradesco.com.br/v2/cob',{
      calendario:{expiracao:3600},
      valor:{original: Number(valor).toFixed(2)},
      chave: chave,
      solicitacaoPagador: 'DG Crediario'
    },{
      httpsAgent: agent,
      headers:{ Authorization:`Bearer ${token}` }
    });
    res.json({ ok:true, pixCopiaECola: cob.data.pixCopiaECola, txid: cob.data.txid, valor });
  }catch(e){
    console.error(e.response?.data || e.message);
    res.status(500).json({ error:'Erro Bradesco', details: e.response?.data || e.message });
  }
});

app.post('/gerar-pix', async (req,res)=>{
  req.query = { valor: req.body?.valor || '1.00' };
  return app._router.handle({ ...req, method:'GET', url:'/gerar-pix' }, res, ()=>{});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('PRODUCAO REAL PEM - '+PORT));
