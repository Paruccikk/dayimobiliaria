# Configuração do canal de e-mail do Alerta Day

O WhatsApp do Alerta Day usa a sessão conectada pelo QR Code (Baileys). Não é necessário configurar a WhatsApp Cloud API nem credenciais da Meta.

O canal de e-mail usa a API HTTP do Resend. Para habilitá-lo:

1. Crie uma conta no Resend e valide o domínio remetente.
2. Gere uma API Key com permissão de envio.
3. No arquivo `.env` da VPS, acrescente somente estas duas variáveis (preserve as demais):

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
ALERTA_EMAIL_FROM=Day Imobiliaria <alertas@seudominio.com.br>
```

4. Reinicie o processo `dayimobiliaria` pelo PM2.

Sem as duas variáveis, a opção de e-mail retorna uma mensagem informando que ainda não está configurada; nenhum envio é tentado.

## Consentimento e público

- O cadastro registra separadamente os aceites de privacidade, e-mail e WhatsApp.
- Push solicita a permissão do navegador e registra o token Firebase quando autorizado.
- A localização é opcional; o usuário pode compartilhar GPS ou informar um endereço para geocodificação quando marcar a autorização de localização.
- O painel seleciona somente perfis com localização autorizada e vigente dentro do raio escolhido.
- WhatsApp só é enviado pela sessão Baileys conectada por QR Code e para perfis com consentimento WhatsApp válido.
- E-mail só é enviado para perfis com consentimento de e-mail válido.

A localização expira em até 90 dias. Revogação e gestão de preferências devem permanecer disponíveis ao usuário; campanhas devem ser revisadas e testadas antes do uso real.
