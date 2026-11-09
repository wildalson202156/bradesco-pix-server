const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();

// LIBERA PARA LOVABLE E NAVEGADOR
app.use(cors({ origin: "*" }));
app.use(express.json());

// ROTA DE TESTE
app.get('/', (req, res) => {
  res.send('Bradesco PIX Server ON - DG Motos');
});

// FUNÇÃO PARA PEGAR TOKEN DO BRADESCO
async function getBradescoToken() {
  const cert = process.env.BRADESCO_CERT_PEM;
  const key = process.env.BRADESCO_KEY_PEM;

  if (!cert || !key) throw new Error("Certificado PEM não encontrado no ENV");

  const agent = new https.Agent({
    cert: cert,
    key: key,
    rejectUnauthorized: false
  });

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.BRADESCO_CLIENT_ID);
  params.append('client_secret', process.env.BRADESCO_CLIENT_SECRET);

  const resp = await axios.post(
    'https://qrapi.bradesco.com.br/parceiros/oauth/token',
    params,
    { httpsAgent: agent, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return resp.data.access_token;
}

// ROTA QUE O LOVABLE VAI CHAMAR - GERA PIX COBV (COM VENCIMENTO)
app.post('/gerar-pix', async (req, res) => {
  try {
    console.log("Recebido do Lovable:", req.body);
    
    const { calendario, valor, chave, solicitacaoPagador } = req.body;
    
    const cert = process.env.BRADESCO_CERT_PEM;
    const key = process.env.BRADESCO_KEY_PEM;

    const agent = new https.Agent({
      cert: cert,
      key: key,
      rejectUnauthorized: false
    });

    const token = await getBradescoToken();
    
    // Gera TXID aleatório de 26 caracteres (padrão Bradesco)
    const txid = `DG${Date.now()}${Math.floor(Math.random()*1000)}`.substring(0, 35);

    const payloadBradesco = {
      calendario: calendario || { dataDeVencimento: "2026-11-15", validadeAposVencimento: 30 },
      valor: valor,
      chave: chave || process.env.BRADESCO_PIX_KEY,
      solicitacaoPagador: solicitacaoPagador || "DG Motos"
    };

    console.log("Enviando pro Bradesco:", payloadBradesco, "TXID:", txid);

    const resp = await axios.put(
      `https://qrapi.bradesco.com.br/v2/cobv/${txid}`,
      payloadBradesco,
      {
        httpsAgent: agent,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("Bradesco OK:", resp.data);

    // Retorna o que o Lovable precisa
    res.json({
      txid: txid,
      pixCopiaECola: resp.data.pixCopiaECola,
      qrcode: resp.data.pixCopiaECola, // Bradesco retorna o copia e cola
      location: resp.data.location,
      dadosBradesco: resp.data
    });

  } catch (err) {
    console.error("ERRO 500 DETALHADO:", err.response ? err.response.data : err.message);
    res.status(500).json({
      erro: "Falha ao gerar PIX",
      detalhe: err.response ? err.response.data : err.message,
      dica: "Verifique se o certificado está com \\n correto e se CLIENT_ID/SECRET estão válidos"
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server rodando na porta ${PORT}`));
