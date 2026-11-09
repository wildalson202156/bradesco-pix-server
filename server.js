const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req,res)=>res.send('DG MOTOS PIX V6 ON'));

function getAgent(){
  let cert = process.env.BRADESCO_CERT_PEM || "";
  let key = process.env.BRADESCO_KEY_PEM || "";
  if(cert.includes('\\n')) cert = cert.replace(/\\n/g, '\n');
  if(key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  return new https.Agent({ cert: cert.trim(), key: key.trim(), rejectUnauthorized: false });
}

async function getToken(){
  const agent = getAgent();
  const id = (process.env.BRADESCO_CLIENT_ID || "").trim();
  const secret = (process.env.BRADESCO_CLIENT_SECRET || "").trim();
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  return new Promise((resolve, reject)=>{
    const data = 'grant_type=client_credentials';
    const options = {
      hostname: 'openapi.bradesco.com.br',
      path: '/parceiros/oauth/token',
      method: 'POST',
      agent: agent,
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res)=>{
      let body = '';
      res.on('data', d=> body+=d);
      res.on('end', ()=>{
        console.log("TOKEN STATUS:", res.statusCode, body.substring(0,200));
        if(res.statusCode >= 200 && res.statusCode < 300){
          try{ resolve(JSON.parse(body).access_token); }catch(e){ reject(body); }
        }else{ reject(`STATUS ${res.statusCode}: ${body}`); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.post('/gerar-pix', async (req,res)=>{
  try{
    const agent = getAgent();
    const token = await getToken();
    const txid = `DG${Date.now()}`.substring(0,32);
    const payload = JSON.stringify({
      calendario: req.body.calendario || { dataDeVencimento: "2026-11-10", validadeAposVencimento: 30 },
      valor: req.body.valor || { original: "10.00" },
      chave: (req.body.chave || process.env.BRADESCO_PIX_KEY || "34340333000181").trim(),
      solicitacaoPagador: req.body.solicitacaoPagador || "DG Motos"
    });

    const cobv = await new Promise((resolve, reject)=>{
      const options = {
        hostname: 'openapi.bradesco.com.br',
        path: `/v2/cobv/${txid}`,
        method: 'PUT',
        agent: agent,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const r = https.request(options, (resp)=>{
        let b=''; resp.on('data',d=>b+=d); resp.on('end',()=>{
          console.log("COBV STATUS:", resp.statusCode, b.substring(0,300));
          if(resp.statusCode>=200 && resp.statusCode<300) resolve(JSON.parse(b));
          else reject(`COBV ${resp.statusCode}: ${b}`);
        });
      });
      r.on('error', reject); r.write(payload); r.end();
    });

    res.json({ txid, pixCopiaECola: cobv.pixCopiaECola, bradesco: cobv });

  }catch(e){
    console.error("ERRO FINAL:", e);
    res.status(500).json({ erro:"Falha", detalhe: String(e).substring(0,1000) });
  }
});

app.listen(process.env.PORT || 10000, ()=>console.log("V6 Rodando"));
