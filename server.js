const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.options("*", cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ----- HELPER STATIC PIX (fallback V10.1) -----
function crc16(str){ let crc=0xFFFF; for(let c of str){ crc^=c.charCodeAt(0)<<8; for(let i=0;i<8;i++){ if(crc&0x8000) crc=(crc<<1)^0x1021; else crc<<=1; } crc&=0xFFFF; } return crc.toString(16).toUpperCase().padStart(4,'0'); }
function fmt(id, val){ return `${id}${String(val.length).padStart(2,'0')}${val}`; }
function gerarPixEstatico(valor, chave, txid){
  let payload=''; payload+=fmt("00","01"); payload+=fmt("26", fmt("00","BR.GOV.BCB.PIX")+fmt("01",chave)); payload+=fmt("52","0000"); payload+=fmt("53","986"); payload+=fmt("54",valor); payload+=fmt("58","BR"); payload+=fmt("59","DG MOTOS"); payload+=fmt("60","SAO LUIS"); payload+=fmt("62", fmt("05",txid.substring(0,25))); payload+="6304"; payload+=crc16(payload); return payload;
}

// ----- AGENT MTLS COM SEU P12 -----
function getMtlsAgent(){
  try{
    if(!process.env.BRADESCO_CERT_P12_BASE64) return null;
    const pfx = Buffer.from(process.env.BRADESCO_CERT_P12_BASE64, 'base64');
    return new https.Agent({ pfx, passphrase: process.env.BRADESCO_CERT_PASS, rejectUnauthorized: false });
  }catch(e){ console.error("Erro P12", e.message); return null; }
}

async function getBradescoToken(agent){
  // URL oficial Token MTLS Produção - está no JSON que você baixou
  const urlToken = process.env.BRADESCO_TOKEN_URL || "https://openapi.bradesco.com.br/v1/auth/token";
  const data = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.BRADESCO_CLIENT_ID,
    client_secret: process.env.BRADESCO_CLIENT_SECRET,
    scope: "pix.read pix.write cob.read cob.write"
  });
  const r = await axios.post(urlToken, data, { httpsAgent: agent, headers: {"Content-Type":"application/x-www-form-urlencoded"} });
  return r.data.access_token;
}

app.get('/', (req,res)=>res.send('DG MOTOS PIX V11 OFICIAL - mTLS ON'));

app.post('/gerar-pix', async (req,res)=>{
  const valor = (req.body.valor?.toString() || "10.00").replace(",",".");
  const parcela_id = (req.body.parcela_id || Date.now().toString()).replace(/\D/g,'').substring(0,20);
  const chave = process.env.BRADESCO_PIX_KEY || "34340333000181";
  const txid = `DG${parcela_id}`.substring(0,25);

  // Tenta DINÂMICO OFICIAL
  try{
    const agent = getMtlsAgent();
    if(agent && process.env.BRADESCO_CLIENT_ID){
      const token = await getBradescoToken(agent);
      // Cria cobrança imediata - endpoint está no seu JSON de PIX Cobranças Imediatas Produção
      const urlCob = process.env.BRADESCO_COB_URL || "https://openapi.bradesco.com.br/v2/cob";
      const cobBody = {
        calendario: { expiracao: 3600 },
        valor: { original: valor },
        chave: chave,
        solicitacaoPagador: `DG MOTOS Parcela ${parcela_id}`,
        infoAdicionais: [{ nome: "Parcela", valor: parcela_id }]
      };
      const r = await axios.put(`${urlCob}/${txid}`, cobBody, { httpsAgent: agent, headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" } });
      const loc = r.data.loc || {};
      return res.json({ modo:"DINAMICO_OFICIAL", txid, parcela_id, valor, pixCopiaECola: r.data.pixCopiaECola || loc.location, bradesco: r.data });
    }
  }catch(e){
    console.error("Falha dinâmico, usando estático:", e.response?.data || e.message);
  }

  // Fallback ESTÁTICO que já provou que cai
  const pix = gerarPixEstatico(valor, chave, txid);
  res.json({ modo:"ESTATICO_FALLBACK", txid, parcela_id, valor, pixCopiaECola: pix, chave });
});

app.get('/teste-pix', (req,res)=>{
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:20px"><h2>DG MOTOS V11 - TESTE OFICIAL</h2><input id="valor" value="10.00" style="padding:8px"/><button onclick="gerar()" style="padding:8px 16px;background:green;color:white;border:none;border-radius:6px">Gerar PIX</button><div id="out" style="margin-top:20px;word-break:break-all;background:#eee;padding:10px"></div><div id="qrcode" style="margin:20px auto;width:250px"></div><script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script><script>async function gerar(){const v=document.getElementById('valor').value;const r=await fetch('/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:v,parcela_id:Date.now()})});const d=await r.json();document.getElementById('out').innerText=d.modo+': '+d.pixCopiaECola;document.getElementById('qrcode').innerHTML='';new QRCode(document.getElementById('qrcode'),d.pixCopiaECola);}</script></body></html>`);
});

app.post('/webhook/pix', (req,res)=>{
  console.log("WEBHOOK PIX RECEBIDO:", JSON.stringify(req.body));
  // Aqui você vai chamar seu Supabase pra dar baixa na parcela: txid = DG{parcela_id}
  res.send("OK");
});

app.listen(PORT, ()=>console.log(`V11 OFICIAL Rodando na ${PORT}`));
