# Alerta Day — configuração de produção

O módulo foi adicionado na branch `feature/cadastro-consentimento-alertas`.

## Acesso administrativo
- Página: `/alerta-day.html`
- O navegador valida o perfil antes de abrir o painel.
- Todas as APIs administrativas também exigem Firebase ID token, perfil ativo e papel `administrador`.
- Não basta conhecer a URL: corretores e clientes recebem HTTP 403 nas rotas de campanhas.

## Variáveis de ambiente

Configure no Render (ou no ambiente Node):

| Variável | Uso |
|---|---|
| `FIREBASE_VAPID_PUBLIC_KEY` | Chave pública Web Push criada nas configurações do Firebase Cloud Messaging |
| `PUBLIC_BASE_URL` | URL pública do site, por exemplo `https://www.rdprimeimoveis.com` |
| `SMTP_HOST` | Servidor SMTP de e-mail |
| `SMTP_PORT` | Porta SMTP; padrão 587 |
| `SMTP_SECURE` | `true` para TLS implícito, normalmente porta 465 |
| `SMTP_USER` / `SMTP_PASS` | Credenciais SMTP |
| `SMTP_FROM` | Remetente autorizado |
| `WHATSAPP_CLOUD_TOKEN` | Token permanente da WhatsApp Cloud API da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de telefone no WhatsApp Business |
| `WHATSAPP_ALERT_TEMPLATE` | Nome de um modelo aprovado pela Meta, com três variáveis no corpo |
| `WHATSAPP_ALERT_TEMPLATE_LANG` | Idioma do modelo; padrão `pt_BR` |

**WhatsApp:** o envio de campanhas usa a API oficial da Meta. O modelo precisa estar aprovado e ter três parâmetros de texto no corpo (título, mensagem e link). A sessão WhatsApp Web/QR já existente no projeto não substitui essas credenciais.

**Push:** no Firebase Console, habilite Cloud Messaging e gere/configure a chave Web Push (VAPID). O site precisa estar publicado em HTTPS. O usuário ainda precisa conceder permissão no navegador.

**E-mail:** configure SMTP antes de habilitar campanhas por e-mail. Sem SMTP, os envios são contabilizados como falha; não são apresentados como enviados.

## Dados e privacidade
- Consentimentos de WhatsApp, e-mail e Push são registrados separadamente.
- A localização é opcional, exige permissão do navegador e expira em até 90 dias.
- O painel mostra contagens, não as coordenadas individuais.
- O usuário pode cancelar alertas e solicitar a remoção dos dados pelo controle de preferências no site.
- O texto da política incluído é uma base operacional e deve ser revisado juridicamente antes do uso em produção, inclusive para completar identificação do controlador, contato do encarregado e direitos do titular.

## Limitação atual de segmentação
O raio geográfico usa coordenadas obtidas com autorização de localização. Endereços digitados no cadastro são armazenados, mas ainda não são geocodificados automaticamente; portanto, para aparecer em campanhas por raio, o usuário precisa autorizar a localização no site.
