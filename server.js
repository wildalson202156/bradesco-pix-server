const express=require('express'),axios=require('axios'),https=require('https'),cors=require('cors'),fs=require('fs'),crypto=require('crypto');
const app=express();app.use(cors({origin:'*'}));app.use(express.json());

function loadFile(path){
  try{
    if(fs.existsSync(path)){
      let s=fs.readFileSync(path,'utf8').replace(/\r/g,'');
      const m=s.match(/-----BEGIN [\s\S]+?-----END [\s\S]+?-----/);
      return m?m[0]:s;
    }
  }catch(e){}
  return null;
}
function getAgent(){
  let cert=loadFile('/etc/secrets/cert.pem')||loadFile('./cert.pem')||process.env.BRADESCO_CERT;
  let key=loadFile('/etc/secrets/key.pem')||loadFile('./key.pem')||process.env.BRADESCO_KEY;
  if(!cert||!key) return null;
  cert=cert.replace(/\r/g,'').trim(); key=key.replace(/\r/g,'').trim();
  try{
    const obj=crypto.createPrivateKey({key,format:'pem'});
    key=obj.export({type:'pkcs8',format:'pem'}).toString();
  }catch(e){ console.log('conv key',e.message); }
  return new https.Agent({cert,key});
}
async function getToken(){
  const agent=getAgent(); if(!agent) throw new Error('Cert nao carregado - use Secret Files');
  const r=await axios.post('https://qrpix.bradesco.com.br/v2/oauth/token',
    new URLSearchParams({grant_type:'client_credentials'}),
    {httpsAgent:agent,auth:{username:process.env.BRADESCO_CLIENT_ID,password:process.env.BRADESCO_CLIENT_SECRET},headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  return r.data.access_token;
}
app.get('/gerar-pix',async(req,res)=>{
  try{
    const agent=getAgent(); if(!agent) return res.status(500).json({error:'Cert nao achado em /etc/secrets/cert.pem'});
    const token=await getToken();
    const cob=await axios.post('https://qrpix.bradesco.com.br/v2/cob',{
      calendario:{expiracao:3600},valor:{original:Number(req.query.valor||'1.00').toFixed(2)},chave:process.env.BRADESCO_CHAVE_PIX||'34340333000181',solicitacaoPagador:'DG'
    },{httpsAgent:agent,headers:{Authorization:`Bearer ${token}`}});
    res.json({ok:true,pixCopiaECola:cob.data.pixCopiaECola,txid:cob.data.txid});
  }catch(e){ res.status(500).json({error:'Bradesco',details:e.response?.data||e.message}); }
});
app.listen(process.env.PORT||10000,()=>console.log('SECRET FILES OK'));
