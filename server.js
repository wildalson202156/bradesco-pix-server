const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req,res)=>res.send('DG MOTOS PIX V11 - QR CODE + WEBHOOK + TESTE ON'));

function crc16(str){
  let crc = 0xFFFF;
  for(let c of str){
    crc ^= c.charCodeAt(0) << 8;
    for(let i=0;i<8;i++){
      if(crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}

function formatPixField(id, value){
  const len = value.length.toString().padStart(2,'0');
  return `${id}${len}${value}`;
}

app.post('/gerar-pix', (req,res)=>{
  try{
    const valor = (req.body.valor?.original || req.body.valor || "10.00").toString();
    const chave = (req.body.chave || process.env.BRADESCO_PIX_KEY || "34340333000181").trim();
    const nome = "DG MOTOS";
    const cidade = "SAO LUIS";
    const parcelaId = req.body.parcela_id || "";
    const txid = `DG${parcelaId || Date.now()}`.substring(0,25).replace(/[^A-Z0-9]/g,'');

    let payload = '';
    payload += formatPixField("00","01");
    payload += formatPixField("26", formatPixField("00","BR.GOV.BCB.PIX") + formatPixField("01", chave));
    payload += formatPixField("52","0000");
    payload += formatPixField("53","986");
    payload += formatPixField("54", valor);
    payload += formatPixField("58","BR");
    payload += formatPixField("59", nome);
    payload += formatPixField("60", cidade);
    payload += formatPixField("62", formatPixField("05", txid));
    payload += "6304";
    payload += crc16(payload);

    res.json({ txid, parcela_id: parcelaId, pixCopiaECola: payload, valor, chave });
  }catch(e){
    res.status(500).json({ erro: String(e) });
  }
});

app.post('/webhook/pix', async (req,res)=>{
  console.log("WEBHOOK RECEBIDO:", JSON.stringify(req.body));
  res.status(200).send('OK');
});

app.get('/teste-pix', (req,res)=>{
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:30px">
    <h2>DG MOTOS - Teste QR Code V11</h2>
    <input id="valor" value="10.00" style="padding:8px" />
    <button onclick="gerar()" style="padding:8px 16px;background:green;color:white;border:none;border-radius:6px">Gerar PIX</button>
    <div id="out" style="margin-top:20px;word-break:break-all;background:#eee;padding:10px"></div>
    <div id="qrcode" style="margin:20px auto;width:250px"></div>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <script>
      async function gerar(){
        const valor = document.getElementById('valor').value;
        const r = await fetch('/gerar-pix', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({valor, parcela_id: Date.now()})});
        const d = await r.json();
        document.getElementById('out').innerText = d.pixCopiaECola;
        document.getElementById('qrcode').innerHTML='';
        new QRCode(document.getElementById('qrcode'), d.pixCopiaECola);
      }
    </script>
    </body></html>
  `);
});

app.listen(process.env.PORT || 10000, ()=>console.log("V11 Rodando"));
