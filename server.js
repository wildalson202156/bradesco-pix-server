const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');
const app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
const PORT = process.env.PORT || 10000;

function crc16(str){let crc=0xFFFF;for(let c of str){crc^=c.charCodeAt(0)<<8;for(let i=0;i<8;i++){if(crc&0x8000)crc=(crc<<1)^0x1021;else crc<<=1;}crc&=0xFFFF;}return crc.toString(16).toUpperCase().padStart(4,'0');}
function fmt(id,val){return `${id}${String(val.length).padStart(2,'0')}${val}`;}
function gerarPixEstatico(valor,chave,txid){let p='';p+=fmt("00","01");p+=fmt("26",fmt("00","BR.GOV.BCB.PIX")+fmt("01",chave));p+=fmt("52","0000");p+=fmt("53","986");p+=fmt("54",valor);p+=fmt("58","BR");p+=fmt("59","DG MOTOS");p+=fmt("60","SAO LUIS");p+=fmt("62",fmt("05",txid.substring(0,25)));p+="6304";p+=crc16(p);return p;}

function getMtlsAgent(){
 try{
  if(!process.env.BRADESCO_CERT_PEM || !process.env.BRADESCO_KEY_PEM) return null;
  return new https.Agent({
   cert: process.env.BRADESCO_CERT_PEM,
   key: process.env.BRADESCO_KEY_PEM,
   rejectUnauthorized: false
  });
 }catch(e){console.error("Erro Agent PEM",e.message);return null;}
}

app.get('/',(req,res)=>res.send('DG MOTOS PIX V11.3 OFICIAL PEM - ON'));

app.post('/gerar-pix', async (req,res)=>{
 const valor=(req.body.valor?.toString()||"1.00").replace(",",".");
 const parcela_id=(req.body.parcela_id||Date.now().toString()).replace(/\D/g,'').substring(0,20);
 const chave=process.env.BRADESCO_PIX_KEY||"34340333000181";
 const txid=`DG${parcela_id}`.substring(0,25);

 // TENTA OFICIAL
 try{
  const agent=getMtlsAgent();
  if(agent && process.env.BRADESCO_CLIENT_ID){
   // Token MTLS - URL está no seu JSON de Token MTLS Produção
   const tokenUrl="https://openapi.bradesco.com.br/v1/auth/token";
   const params=new URLSearchParams({grant_type:"client_credentials",client_id:process.env.BRADESCO_CLIENT_ID,client_secret:process.env.BRADESCO_CLIENT_SECRET});
   const tok=await axios.post(tokenUrl, params, {httpsAgent:agent, headers:{"Content-Type":"application/x-www-form-urlencoded"}});
   const access_token=tok.data.access_token;
   console.log("Token Bradesco OK");

   // Cria cobrança dinâmica
   const cobUrl=`https://openapi.bradesco.com.br/v2/cob/${txid}`;
   const cobBody={calendario:{expiracao:3600},valor:{original:valor},chave:chave,solicitacaoPagador:`DG Parcela ${parcela_id}`};
   const cob=await axios.put(cobUrl, cobBody, {httpsAgent:agent, headers:{Authorization:`Bearer ${access_token}`,"Content-Type":"application/json"}});
   console.log("COB Criada",cob.data.txid);
   return res.json({modo:"DINAMICO_OFICIAL_PEM",txid,parcela_id,valor,pixCopiaECola:cob.data.pixCopiaECola, loc:cob.data.loc});
  }
 }catch(e){
  console.error("Falha OFICIAL, caindo pro estático:", e.response?.data || e.message);
 }

 const pix=gerarPixEstatico(valor,chave,txid);
 return res.json({modo:"ESTATICO_FALLBACK",txid,parcela_id,valor,pixCopiaECola:pix});
});

app.get('/teste-pix',(req,res)=>{
 res.send(`<html><body style="text-align:center;font-family:sans-serif;padding:20px"><h2>DG MOTOS V11.3 PEM - TESTE OFICIAL</h2><input id="valor" value="1,00" style="padding:10px"/><button onclick="gerar()" style="padding:10px 20px;background:#CC0000;color:white;border:none;border-radius:8px">Gerar PIX</button><div id="out" style="margin-top:15px;background:#eee;padding:10px;word-break:break-all"></div><div id="qrcode" style="margin:20px auto;width:250px"></div><script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script><script>async function gerar(){const v=document.getElementById('valor').value.replace(',','.');const r=await fetch('/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:v,parcela_id:Date.now()})});const d=await r.json();document.getElementById('out').innerText=d.modo+': '+(d.pixCopiaECola||JSON.stringify(d));document.getElementById('qrcode').innerHTML='';if(d.pixCopiaECola) new QRCode(document.getElementById('qrcode'),{text:d.pixCopiaECola,width:250,height:250});}</script></body></html>`);
});

app.listen(PORT,()=>console.log(`V11.3 PEM Rodando ${PORT}`));
});
