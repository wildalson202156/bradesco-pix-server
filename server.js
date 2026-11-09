const express = require('express');
const axios = require('axios');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

// PEGA O CERTIFICADO DO PFX QUE JÁ ESTÁ NA RENDER
function getAgent(){
  try{
    const pfxBase64 = process.env.PFX_BASE64;
    const senha = process.env.PFX_SENHA || '1234';
    
    if(!pfxBase64){
      throw new Error("PFX_BASE64 não encontrado no Environment da Render");
    }

    // Converte base64 para buffer
    const pfxBuffer = Buffer.from(pfxBase64, 'base64');

    console.log("Certificado PFX carregado OK, tamanho:", pfxBuffer.length);

    return new https.Agent({
      pfx: pfxBuffer,
      passphrase: senha,
      keepAlive: true,
      rejectUnauthorized: true
    });
  }catch(e){
    console.error("ERRO AO LER CERTIFICADO:", e.message);
    throw e;
  }
}

// PEGA O TOKEN DO BRADESCO
async function getToken(){
  const agent = getAgent();
  const baseUrl = process.env.BRADESCO_BASE_URL || 'https://qrsandbox.bradesco.com.br';
  
  const params = new URLSearchParams({grant_type:'client_credentials'});
  
  const r = await axios.post(`${baseUrl}/v2/oauth/token`, params, {
    httpsAgent: agent,
    auth:{
      username: process.env.BRADESCO_CLIENT_ID, 
      password: process.env.BRADESCO_CLIENT_SECRET
    },
    headers:{'Content-Type':'application/x-www-form-urlencoded'}
  });
  
  console.log("Token Bradesco OK");
  return r.data.access_token;
}

// CRIA A COBRANÇA PIX COM VENCIMENTO (COBV)
async function criarCobranca(req,res){
  try{
    const valorDigitado = req.query.valor || req.body?.valor || '1';
    console.log("GERANDO PIX valor:", valorDigitado);
    
    const agent = getAgent();
    const token = await getToken();
    const baseUrl = process.env.BRADESCO_BASE_URL || 'https://qrsandbox.bradesco.com.br';
    
    const valor = Number(valorDigitado).toFixed(2);
    
    // Vencimento amanhã
    const amanha = new Date(); 
    amanha.setDate(amanha.getDate()+1);
    const dataVenc = amanha.toISOString().split('T')[0];
    
    // TXID único
    const txid = 'DGMOTOS' + Date.now().toString().slice(-10) + Math.random().toString(36).substring(2,6).toUpperCase();

    const body = {
      calendario:{
        dataDeVencimento: dataVenc, 
        validadeAposVencimento: 1
      },
      devedor:{
        cnpj:'34340333000181', 
        nome:'DG MOTOS LTDA'
      },
      valor:{
        original: valor
      },
      chave: process.env.BRADESCO_PIX_KEY || '34340333000181',
      solicitacaoPagador:'DG MOTOS - PARCELA'
    };

    console.log("Enviando para Bradesco:", txid, valor, baseUrl);
    
    const cob = await axios.put(`${baseUrl}/v2/cobv/${txid}`, body, {
      httpsAgent: agent,
      headers:{Authorization:`Bearer ${token}`}
    });

    console.log("COBV CRIADO COM SUCESSO", txid);
    
    res.json({
      ok:true, 
      valor, 
      vencimento:dataVenc, 
      txid, 
      pixCopiaECola: cob.data.pixCopiaECola, 
      qrCode: cob.data.pixCopiaECola,
      bradesco: cob.data
    });

  }catch(e){
    console.error('ERRO AO CRIAR COBV:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    res.status(e.response?.status || 500).json({
      erro: e.response?.data || e.message, 
      status: e.response?.status
    });
  }
}

// ROTAS
app.get('/gerar-pix', criarCobranca);
app.post('/gerar-pix', criarCobranca);
app.get('/', (req,res)=>res.send('COBV PUT OK - ' + new Date().toISOString() + ' - PFX carregado'));

const porta = process.env.PORT || 10000;
app.listen(porta, ()=>console.log('SERVIDOR NO AR - Porta ' + porta + ' - ' + new Date().toISOString()));
