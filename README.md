# R&D PRIME IMÓVEIS

Site institucional e painel administrativo da R&D Prime Imóveis.

## Stack
- Node.js 20+
- Express
- Firebase Authentication e Realtime Database
- Frontend HTML, CSS e JavaScript
- WhatsApp via Baileys (sessão QR)
- Push via Firebase Cloud Messaging
- E-mail transacional via Nodemailer/SMTP

## Branch oficial

**A branch `main` é a única fonte oficial para produção.**

- Faça as próximas alterações em branches novas e integre por Pull Request para `main`.
- Não atualize a VPS por branches antigas como `feature/busca-imoveis-paineis`.
- Depois de um PR aprovado e integrado, atualize a VPS somente com `git pull origin main`.

## Atualização da VPS Debian

Na pasta `/var/www/dayimobiliaria`:

```bash
cd /var/www/dayimobiliaria
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run check
pm2 restart dayimobiliaria --update-env
pm2 status
curl -fsS http://127.0.0.1:3000/api/health
```

Se `npm run check` falhar, não reinicie o PM2; corrija o erro primeiro.

## Dados que devem ser preservados

Nunca apague durante uma atualização:
- `.env`
- `uploads/imoveis/`
- `data/whatsapp_auth/` — contém a sessão QR do WhatsApp

Esses dados são locais/privados da instalação e não devem ser substituídos por arquivos do Git.

## Alerta Day

A Central Alerta Day está em `/alerta-day.html`. Os canais Push, WhatsApp e e-mail respeitam os consentimentos registrados. O servidor deduplica destinatários por token, telefone e endereço de e-mail e registra um identificador de solicitação para impedir o reprocessamento da mesma campanha.

Para enviar e-mails, configure no `.env`:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

O canal de e-mail permanece indisponível até que o SMTP esteja configurado e validado.

## Verificação local

```bash
npm ci
npm run check
npm start
```
