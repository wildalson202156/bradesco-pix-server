app.get('/', (req, res) => {
  res.send(`
    <h2>PIX EMV DG MOTOS ONLINE - V2/COB</h2>
    <p>Servidor online!</p>
    <form action="/gerar-pix" method="POST">
      <input name="valor" placeholder="Valor ex: 100" required><br><br>
      <input name="nomeCliente" placeholder="Nome do cliente" required><br><br>
      <button type="submit">Gerar PIX</button>
    </form>
    <p>Se gerar, vai aparecer o QR Code e o copia e cola aqui.</p>
  `);
});
