const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
    <h2>PIX EMV DG MOTOS ONLINE - V2/COB</h2>
    <p>Servidor online!</p>
    <form action="/gerar-pix" method="POST">
      <input name="valor" placeholder="Valor ex: 100" required><br><br>
      <input name="nomeCliente" placeholder="Nome do cliente" required><br><br>
      <button type="submit">Gerar PIX</button>
    </form>
  `);
});

app.post('/gerar-pix', (req, res) => {
  const valor = req.body.valor;
  const nome = req.body.nomeCliente;
  res.send(`<h2>Teste OK!</h2><p>Valor: ${valor}</p><p>Cliente: ${nome}</p><p>Agora falta ligar no Bradesco.</p><a href="/">Voltar</a>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
