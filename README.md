# Bradesco Pix Server (mTLS)

Servidor Node para gerar Pix imediato do Bradesco com certificado digital (.p12).

## Como usar

1. Hospede este repositório em Render, Railway ou uma VPS.
2. Coloque o arquivo certificado em `certs/bradesco.p12`.
3. Configure as variáveis de ambiente:
   - `BRADESCO_CLIENT_ID` — client_id do Bradesco
   - `BRADESCO_CLIENT_SECRET` — client_secret do Bradesco
   - `BRADESCO_CERT_PASSWORD` — senha do certificado .p12
   - `BRADESCO_PIX_KEY` — chave Pix de recebimento
   - `BRADESCO_BASE_URL` (opcional) — obrigatório é `https://qrpix-h.bradesco.com.br`
4. Rode: `npm install && npm start`

## Endpoints

- `POST /pix` com `{ "valor": 10.00, "nome": "NOME DO CLIENTE", "cpf": "000.000.000-00" }` — retorna `txid` e `qrcode` (Pix copia e cola)
- `GET /health` — retorna `{ ok: true, cert: true }` se o certificado foi encontrado
