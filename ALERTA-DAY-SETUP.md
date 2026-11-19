# Alerta Day — configuração de produção

## Acesso administrativo
- Página: `/alerta-day.html`.
- A conexão QR do WhatsApp fica dentro da própria Central Alerta Day.
- A interface valida o perfil e as APIs exigem Firebase ID token, perfil ativo e papel `administrador`.
- A página independente `/whatsapp.html` não faz mais parte deste fluxo.

## Variáveis de ambiente
| Variável | Uso |
|---|---|
| `FIREBASE_VAPID_PUBLIC_KEY` | Chave pública Web Push do Firebase Cloud Messaging |
| `PUBLIC_BASE_URL` | URL HTTPS pública do site |
| `SMTP_HOST` | Servidor SMTP |
| `SMTP_PORT` | Porta SMTP; padrão 587 |
| `SMTP_SECURE` | `true` para TLS implícito, normalmente porta 465 |
| `SMTP_USER` / `SMTP_PASS` | Credenciais SMTP |
| `SMTP_FROM` | Remetente autorizado |
| `ALERTA_DAY_ENCRYPTION_KEY` | Chave AES-256-GCM em Base64 (32 bytes) ou hexadecimal (64 caracteres) |
| `FIREBASE_PROJECT_ID` | ID Firebase; também participa da chave de compatibilidade dos registros antigos |

## WhatsApp na Central Alerta Day
A Central usa o cliente Baileys que já existia no histórico do projeto. Abra `/alerta-day.html`, clique em **Conectar por QR Code** e leia o código em WhatsApp → Aparelhos conectados → Conectar um aparelho. A sessão fica em `data/whatsapp_auth`; preserve esse diretório em backups e não o exponha pela web.

Baileys é uma integração não oficial com o WhatsApp e pode ser desconectada ou restringida pela plataforma. Envie somente para pessoas com consentimento ativo, em volumes moderados, e respeite descadastros.

## Público e compatibilidade dos dados
O painel lê tanto `alertaDay/inscricoes` quanto a estrutura anterior `alertaDay/visitantes`. Os registros antigos usam `consentimentoLocalizacao`, `latitude`, `longitude`, `expiraEm`, `pushConsent`, `fcmToken`, `whatsappConsent`, `telefoneWhatsAppEnc`, `ownerUid` e `whatsappOwnerUid`. Os números protegidos são descriptografados apenas no servidor e nunca enviados ao navegador.

Quando há vínculo com uma conta, uma revogação explícita na conta ou `whatsappAtivo=false` bloqueia o envio. Registros sem UID continuam elegíveis quando guardam consentimento expresso e número protegido válido.

## Push, e-mail e mapa
- Push exige Cloud Messaging habilitado, VAPID pública e HTTPS; o usuário precisa permitir notificações no navegador.
- E-mail exige SMTP funcional.
- Leaflet usa Esri Street Map e troca para Esri Topographic se os tiles principais falharem.
- A segmentação geográfica considera somente quem autorizou a localização e cuja autorização não expirou.

## Privacidade
Consentimentos de WhatsApp, e-mail, Push e localização são independentes. A localização é opcional e expira em até 90 dias. O painel exibe somente totais e resultados, não coordenadas individuais. A política de privacidade precisa de revisão jurídica antes de produção.


## Endereço do usuário e alcance regional

- A página `/minha-conta.html` permite que cada usuário autenticado informe ou atualize CEP, rua, número, bairro, cidade e UF.
- O endereço só entra no cálculo regional quando o usuário marca explicitamente a autorização de uso para alertas por região.
- Ao salvar com autorização, o servidor geocodifica o endereço e grava a localização vinculada ao UID em `alertaDay/inscricoes/{uid}`, preservando as preferências de canais já existentes.
- O Alerta Day considera essa localização do perfil além das localizações previamente autorizadas pelos visitantes. Não há rastreamento GPS em tempo real.
- O consentimento pode ser revogado na mesma página; nesse caso, as coordenadas deixam de contar para o alcance regional.
- A conexão WhatsApp e o QR Code são exibidos no painel lateral da página `/alerta-day.html`; o QR não usa mais janela modal.
