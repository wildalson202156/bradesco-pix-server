const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

function getAgent(){
 let c=(process.env.BRADESCO_CERT||'').replace(/\\n/g,'\n');
 let k=(process.env.BRADESCO_KEY||'').replace(/\\n/g,'\n');
 if(!c||!k) return null;
 return new https.Agent({cert:c,key:k});
}
async function getToken(){
 const agent=getAgent();
 const id=process.env.BRADESCO_CLIENT_ID;
 const secret=process.env.BRADESCO_CLIENT_SECRET;
 const r=await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token',
  new URLSearchParams({grant_type:'client_credentials'}),
  {httpsAgent:agent,auth:{username:id,password:secret},headers:{'Content-Type':'application/x-www-form-urlencoded'}}
 );
 return r.data.access_token;
}
app.get('/status',(req,res)=>res.json({certificado:getAgent()?'OK':'ausente',cnpj:process.env.BRADESCO_CHAVE_PIX}));
app.get('/gerar-pix', async (req,res)=>{
 try{
  const valor=req.query.valor||req.body?.valor||'1.00';
  const agent=getAgent();
  if(!agent) return res.status(500).json({error:'sem cert'});
  const token=await getToken();
  const chave=process.env.BRADESCO_CHAVE_PIX||'34340333000181';
  const cob=await axios.post('https://qrpix.bradesco.com.br/v2/cob',{
   calendario:{expiracao:3600},
   valor:{original:Number(valor).toFixed(2)},
   chave:chave,
   solicitacaoPagador:'DG Crediario'
  },{httpsAgent:agent,headers:{Authorization:`Bearer ${token}`}});
  res.json({ok:true,pixCopiaECola:cob.data.pixCopiaECola,txid:cob.data.txid,valor});
 }catch(e){
  res.status(500).json({error:'Bradesco erro',details:e.response?.data||e.message});
 }
});
app.post('/gerar-pix', (req,res)=>{ req.query=req.body; return app._router.handle({...req,method:'GET',url:'/gerar-pix?valor='+req.body.valor},res); });
const PORT=process.env.PORT||10000;
app.listen(PORT,()=>console.log('PRODUCAO REAL '+PORT));
