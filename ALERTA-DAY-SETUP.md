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
| `WHATSAPP_WEB_ENABLED` | Defina `false` para desativar a sessão QR; padrão habilitado |
| `WHATSAPP_SESSION_PATH` | Diretório persistente da sessão; padrão `data/whatsapp-session` |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho do Chromium, se necessário no servidor |

| Variável | Uso |
|---|---|
| `FIREBASE_VAPID_PUBLIC_KEY` | Chave pública Web Push criada nas configurações do Firebase Cloud Messaging |
| `PUBLIC_BASE_URL` | URL pública do site, por exemplo `https://www.rdprimeimoveis.com` |
| `SMTP_HOST` | Servidor SMTP de e-mail |
| `SMTP_PORT` | Porta SMTP; padrão 587 |
| `SMTP_SECURE` | `true` para TLS implícito, normalmente porta 465 |
| `SMTP_USER` / `SMTP_PASS` | Credenciais SMTP |
| `SMTP_FROM` | Remetente autorizado |

**WhatsApp:** o envio das campanhas usa a sessão persistente do WhatsApp Web conectada pelo QR Code na Central Alerta Day ou em `/whatsapp.html`. A sessão fica no servidor em `data/whatsapp-session` (ou no caminho definido por `WHATSAPP_SESSION_PATH`). Preserve esse diretório em backups e restrinja o acesso. Os envios são sequenciais e somente para contatos com consentimento WhatsApp ativo. `whatsapp-web.js` é uma integração não oficial; o WhatsApp pode encerrar a sessão ou restringir a conta. Evite disparos em massa e respeite imediatamente os pedidos de descadastro.

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


## Mapa
- O mapa Leaflet usa tiles Esri Street Map e tenta Esri Topographic como alternativa se o primeiro serviço falhar.
- O painel recalcula o tamanho do mapa após login e quando a área muda de dimensão, evitando o mapa cinza após a abertura da página.
