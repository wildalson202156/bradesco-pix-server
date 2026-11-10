const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req,res)=>res.send('DG MOTOS PIX V10 - QR CODE + WEBHOOK ON'));

// CRC16 BACEN
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

// 1. GERAR QR CODE
app.post('/gerar-pix', (req,res)=>{
  try{
    const valor = (req.body.valor?.original || req.body.valor || "10.00").toString();
    const chave = (req.body.chave || process.env.BRADESCO_PIX_KEY || "34340333000181").trim();
    const nome = "DG MOTOS";
    const cidade = "SAO LUIS";
    // txid curto para identificar a parcela
    const parcelaId = req.body.parcela_id || req.body.txid || "";
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

    console.log(`PIX GERADO: ${valor} | TXID: ${txid}`);

    res.json({
      txid,
      parcela_id: parcelaId,
      pixCopiaECola: payload,
      valor,
      chave
    });

  }catch(e){
    console.error(e);
    res.status(500).json({ erro: String(e) });
  }
});

// 2. WEBHOOK PARA DAR BAIXA - ISSO QUE VAI DAR BAIXA NO LOVABLE
app.post('/webhook/pix', async (req,res)=>{
  try{
    console.log("WEBHOOK RECEBIDO:", JSON.stringify(req.body));
    
    // Aqui vem do Bradesco quando um PIX cai
    // Formato Bradesco: { pix: [{ txid, valor, endToEndId }] } 
    // ou formato do seu banco se for polling manual
    
    const pixList = req.body.pix || [req.body];
    
    for(const pix of pixList){
      const txid = pix.txid || pix.txId || "";
      const valor = pix.valor || pix.valorRecebido;
      
      // EXTRAI o parcela_id do txid DG + id
      const parcelaId = txid.replace('DG','');
      
      console.log(`BAIXA: Parcela ${parcelaId} - Valor ${valor}`);

      // --- AQUI VOCÊ CHAMA O LOVABLE / SUPABASE PARA DAR BAIXA ---
      // Exemplo: se seu Lovable tem uma Edge Function
      // await fetch('https://SEU-PROJETO.supabase.co/functions/v1/dar-baixa-parcela', {
      //   method: 'POST',
      //   body: JSON.stringify({ parcela_id: parcelaId, txid, valor }),
      //   headers: { 'Authorization': 'Bearer SEU_ANON_KEY' }
      // })

      // Por enquanto só loga
    }

    res.status(200).send('OK - Baixa processada');
  }catch(e){
    console.error("Erro webhook:", e);
    res.status(200).send('OK'); // sempre 200 pro Bradesco não re-tentar infinito
  }
});

app.listen(process.env.PORT || 10000, ()=>console.log("V10 QR + WEBHOOK Rodando"));
