const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
const PORT = process.env.PORT || 10000;

function crc16(str){let crc=0xFFFF;for(let c of str){crc^=c.charCodeAt(0)<<8;for(let i=0;i<8;i++){if(crc&0x8000)crc=(crc<<1)^0x1021;else crc<<=1;}crc&=0xFFFF;}return crc.toString(16).toUpperCase().padStart(4,'0');}
function fmt(id,val){return `${id}${String(val.length).padStart(2,'0')}${val}`;}
function gerarPixEstatico(valor,chave,txid){
 let p='';p+=fmt("00","01");p+=fmt("26",fmt("00","BR.GOV.BCB.PIX")+fmt("01",chave));p+=fmt("52","0000");p+=fmt("53","986");p+=fmt("54",valor);p+=fmt("58","BR");p+=fmt("59","DG MOTOS");p+=fmt("60","SAO LUIS");p+=fmt("62",fmt("05",txid.substring(0,25)));p+="6304";p+=crc16(p);return p;
}

app.get('/',(req,res)=>res.send('DG MOTOS PIX V11.2 - ESTAVEL ON'));

app.post('/gerar-pix',(req,res)=>{
 try{
  const valor=(req.body.valor?.toString()||"1.00").replace(",",".");
  const parcela_id=(req.body.parcela_id||Date.now().toString()).replace(/\D/g,'').substring(0,20);
  const chave=process.env.BRADESCO_PIX_KEY||"34340333000181";
  const txid=`DG${parcela_id}`.substring(0,25);
  const pix=gerarPixEstatico(valor,chave,txid);
  console.log(`PIX Gerado ${txid} R$${valor}`);
  return res.json({modo:"ESTATICO_ESTAVEL",txid,parcela_id,valor,pixCopiaECola:pix,chave});
 }catch(e){
  console.error(e);
  return res.status(500).json({erro:e.message});
 }
});

app.get('/teste-pix',(req,res)=>{
 res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:20px">
 <h2>DG MOTOS V11.2 - TESTE ESTAVEL</h2>
 <input id="valor" value="1,00" style="padding:10px;font-size:18px;width:120px"/>
 <button onclick="gerar()" style="padding:10px 20px;background:#CC0000;color:white;border:none;border-radius:8px;font-size:18px;cursor:pointer">Gerar PIX</button>
 <div id="out" style="margin-top:20px;word-break:break-all;background:#eee;padding:15px;border-radius:8px"></div>
 <div id="qrcode" style="margin:20px auto;width:250px"></div>
 <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
 <script>async function gerar(){try{const v=document.getElementById('valor').value.replace(',','.');const out=document.getElementById('out');out.innerText='Gerando...';const r=await fetch('/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:v,parcela_id:Date.now()})});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));out.innerText=d.modo+': '+d.pixCopiaECola;document.getElementById('qrcode').innerHTML='';new QRCode(document.getElementById('qrcode'),{text:d.pixCopiaECola,width:250,height:250});}catch(e){document.getElementById('out').innerText='Erro: '+e.message;}}</script>
 </body></html>`);
});

app.post('/webhook/pix',(req,res)=>{console.log("WEBHOOK:",JSON.stringify(req.body));res.send("OK");});

app.listen(PORT,()=>console.log(`V11.2 ESTAVEL Rodando na ${PORT}`));
