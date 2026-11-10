const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');
const app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
const PORT = process.env.PORT || 10000;

function crc16(s){let c=0xFFFF;for(let ch of s){c^=ch.charCodeAt(0)<<8;for(let i=0;i<8;i++){c=c&0x8000?(c<<1)^0x1021:c<<1;c&=0xFFFF;}}return c.toString(16).toUpperCase().padStart(4,'0');}
function fmt(id,val){return `${id}${String(val.length).padStart(2,'0')}${val}`;}
function gerarPixEstatico(v,chave,txid){let p='';p+=fmt("00","01");p+=fmt("26",fmt("00","BR.GOV.BCB.PIX")+fmt("01",chave));p+=fmt("52","0000");p+=fmt("53","986");p+=fmt("54",v);p+=fmt("58","BR");p+=fmt("59","DG MOTOS");p+=fmt("60","SAO LUIS");p+=fmt("62",fmt("05",txid));p+="6304";p+=crc16(p);return p;}

function getMtlsAgent(){
 try{
  let cert = process.env.BRADESCO_CERT_PEM;
  let key = process.env.BRADESCO_KEY_PEM;
  if(!cert || !key) { console.log("SEM CERTIFICADO PEM CONFIGURADO"); return null; }
  // Corrige \n que vem do Render
  cert = cert.replace(/\\n/g, '\n');
  key = key.replace(/\\n/g, '\n');
  return new https.Agent({cert, key, rejectUnauthorized:false, keepAlive:true});
 }catch(e){ console.log("ERRO AGENT:", e.message); return null; }
}

app.get('/',(r,s)=>s.send('DG MOTOS V11.6 SEGURO - ON'));

app.post('/gerar-pix', async (req,res)=>{
 try{
  const valor = (req.body.valor||"1.00").toString().replace(",",".").replace(/[^0-9.]/g,'');
  const parcela_id = (req.body.parcela_id!=null?req.body.parcela_id:Date.now()).toString().replace(/\D/g,'').substring(0,20) || Date.now().toString().substring(0,10);
  const chave = process.env.BRADESCO_PIX_KEY||"34340333000181";
  const txid = `DG${parcela_id}`.substring(0,25);
  const agent = getMtlsAgent();

  if(agent && process.env.BRADESCO_CLIENT_ID){
   try{
    const tokenUrl = "https://openapi.bradesco.com.br/auth/server/v1.1/token";
    const params = new URLSearchParams();
    params.append("grant_type","client_credentials");
    console.log("Tentando TOKEN com mTLS...");
    const tok = await axios.post(tokenUrl, params, {
     httpsAgent: agent,
     auth: { username: process.env.BRADESCO_CLIENT_ID, password: process.env.BRADESCO_CLIENT_SECRET },
     headers: {"Content-Type":"application/x-www-form-urlencoded"},
     timeout: 15000
    });
    console.log("TOKEN OK:", tok.data.access_token ? "RECEBIDO" : "VAZIO");
    const cobUrl = `https://openapi.bradesco.com.br/v2/cob/${txid}`;
    const cobBody = {calendario:{expiracao:3600}, valor:{original:valor}, chave:chave, solicitacaoPagador:`DG Parcela ${parcela_id}`};
    const cob = await axios.put(cobUrl, cobBody, {httpsAgent:agent, headers:{Authorization:`Bearer ${tok.data.access_token}`,"Content-Type":"application/json"}, timeout:10000});
    console.log("COB CRIADA:", txid);
    return res.json({modo:"DINAMICO_OFICIAL", txid, parcela_id, valor, pixCopiaECola:cob.data.pixCopiaECola});
   }catch(e){
    // LOG SEGURO - SEM MOSTRAR SECRET
    const status = e.response?.status;
    const data = e.response?.data;
    console.log(`FALHA OFICIAL [${status||'SEM STATUS'}]:`, data ? JSON.stringify(data).substring(0,300) : e.message, e.code||'');
   }
  } else {
   console.log("AGENT NULL OU SEM CLIENT_ID - usando estático");
  }
  const pix = gerarPixEstatico(valor,chave,txid);
  return res.json({modo:"ESTATICO_FALLBACK", txid, parcela_id, valor, pixCopiaECola:pix});
 }catch(err){ console.log("ERRO GERAL:", err.message); return res.status(500).json({erro:err.message});}
});

app.get('/teste-pix',(req,res)=>{
 res.send(`<h2>V11.6 SEGURO</h2><input id=v value="1,00"><button onclick="gerar()">Gerar</button><div id=out></div><div id=q></div><script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script><script>async function gerar(){const r=await fetch('/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:document.getElementById('v').value,parcela_id:Date.now()})});const d=await r.json();document.getElementById('out').innerText=d.modo+': '+d.pixCopiaECola;document.getElementById('q').innerHTML='';new QRCode(document.getElementById('q'),{text:d.pixCopiaECola,width:250,height:250});}</script>`);
});

app.listen(PORT,()=>console.log(`V11.6 Rodando ${PORT}`));
