app.get('/teste-pix', (req,res)=>{
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:30px">
    <h2>DG MOTOS - Teste QR Code</h2>
    <input id="valor" value="10.00" />
    <button onclick="gerar()">Gerar PIX</button>
    <div id="out" style="margin-top:20px;word-break:break-all"></div>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <div id="qrcode" style="margin:20px auto;width:250px"></div>
    <script>
      async function gerar(){
        const valor = document.getElementById('valor').value
        const r = await fetch('/gerar-pix', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({valor, parcela_id: Date.now()})})
        const d = await r.json()
        document.getElementById('out').innerText = d.pixCopiaECola
        document.getElementById('qrcode').innerHTML=''
        new QRCode(document.getElementById('qrcode'), d.pixCopiaECola)
      }
    </script>
    </body></html>
  `)
})
