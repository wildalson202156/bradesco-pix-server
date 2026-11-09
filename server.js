const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get('/', (req,res)=>res.send('DG MOTOS PIX V9 LOCAL ON - FUNCIONA SEM BRADESCO'));

// Função CRC16 do PIX
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
    const valor = req.body.valor?.original || "10.00";
    const chave = (req.body.chave || process.env.BRADESCO_PIX_KEY || "34340333000181").trim();
    const nome = "DG MOTOS";
    const cidade = "SAO LUIS";
    const txid = `DG${Date.now()}`.substring(0,25);

    // Monta payload PIX padrão BACEN (funciona em QUALQUER banco)
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

    console.log("PIX GERADO LOCAL:", payload);

    res.json({
      txid,
      pixCopiaECola: payload,
      valor,
      chave,
      aviso: "PIX GERADO LOCALMENTE - VALIDO E RECEBE NA HORA SEM PRECISAR DO SERVIDOR BRADESCO"
    });

  }catch(e){
    console.error(e);
    res.status(500).json({ erro: String(e) });
  }
});

app.listen(process.env.PORT || 10000, ()=>console.log("V9 LOCAL Rodando"));
