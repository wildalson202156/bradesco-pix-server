const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req,res)=>res.send('DG MOTOS PIX V8 ON - TOKEN SEM CERT'));

function getAgent(){
  let cert = process.env.BRADESCO_CERT_PEM || "";
  let key = process.env.BRADESCO_KEY_PEM || "";
  if(cert.includes('\\n')) cert = cert.replace(/\\n/g, '\n');
  if(key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  return new https.Agent({ cert: cert.trim(), key: key.trim(), rejectUnauthorized: false });
}

// TOKEN SEM CERTIFICADO!
async function getToken(){
  const id = (process.env.BRADESCO_CLIENT_ID || "").trim();
  const secret = (process.env.BRADESCO_CLIENT_SECRET || "").trim();
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const data = 'grant_type=client_credentials';

  return new Promise((resolve, reject)=>{
    const options = {
      hostname: 'openapi.bradesco.com.br',
      path: '/v2/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    console.log("PEDINDO TOKEN SEM CERT para", options.path);
    const req = https.request(options, (res)=>{
      let body = '';
      res.on('data', d=> body+=d);
      res.on('end', ()=>{
        console.log(`TOKEN STATUS: ${res.statusCode} BODY:`, body.substring(0,500));
        if(res.statusCode >= 200 && res.statusCode < 300){
          try{ resolve(JSON.parse(body).access_token); }catch(e){ reject(body); }
        }else{ reject(`TOKEN ${res.statusCode}: ${body}`); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.post('/gerar-pix', async (req,res)=>{
  try{
    const token = await getToken();
    console.log("TOKEN OK:", token.substring(0,20)+"...");
    
    const agent = getAgent();
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
          console.log("COBV STATUS:", resp.statusCode, b.substring(0,500));
          if(resp.statusCode>=200 && resp.statusCode<300) resolve(JSON.parse(b));
          else reject(`COBV ${resp.statusCode}: ${b}`);
        });
      });
      r.on('error', reject); r.write(payload); r.end();
    });

    res.json({ txid, pixCopiaECola: cobv.pixCopiaECola, bradesco: cobv });

  }catch(e){
    console.error("ERRO FINAL:", e);
    res.status(500).json({ erro:"Falha", detalhe: String(e).substring(0,2000) });
  }
});

app.listen(process.env.PORT || 10000, ()=>console.log("V8 Rodando"));
