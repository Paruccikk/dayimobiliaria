# Alerta Day — configuração antes da publicação

O módulo está isolado na branch `feature/alerta-day`. Não faça merge nem deploy antes de preencher e validar os itens abaixo.

## Firebase Cloud Messaging (Push)

1. No Firebase Console do projeto R&D Prime, habilite a API Firebase Cloud Messaging.
2. Em Project settings → Cloud Messaging → Web configuration, gere/consulte o par de chaves Web Push.
3. Cadastre a chave pública como variável de ambiente `FIREBASE_VAPID_KEY`.
4. Confirme que o servidor tem credenciais Firebase Admin com permissão para enviar mensagens.
5. O arquivo `frontend/firebase-messaging-sw.js` usa a configuração pública do Firebase Web SDK. Ela identifica o projeto, não é uma chave privada.

A autorização de localização e a autorização de notificações são independentes. O navegador só mostra o pedido de permissão de Push depois de uma ação do visitante. Em iPhone, o visitante precisa adicionar o site à Tela de Início para usar Web Push.

## URL pública

Defina `PUBLIC_SITE_URL` com a origem HTTPS exata, sem barra final, por exemplo `https://www.seudominio.com.br`. O backend valida essa origem antes de permitir campanhas, porque links de notificação precisam abrir o anúncio no site seguro.

## Proteção de telefones

Gere uma chave aleatória de 32 bytes em Base64 no servidor:

```bash
openssl rand -base64 32
```

Cadastre o resultado como `ALERTA_DAY_ENCRYPTION_KEY`. Não coloque essa chave no GitHub, no frontend ou em mensagens. Os telefones WhatsApp são armazenados cifrados com AES-256-GCM. Perder a chave impede recuperar os telefones já armazenados; mantenha backup seguro e restrito.

## WhatsApp Cloud API (opcional)

Configure no ambiente do servidor:

- `WHATSAPP_PHONE_NUMBER_ID`: ID do número de telefone no WhatsApp Business.
- `WHATSAPP_ACCESS_TOKEN`: token de acesso de longa duração/produção, guardado como segredo.
- `WHATSAPP_ALERT_TEMPLATE`: nome de um modelo de mensagem aprovado pela Meta.
- `WHATSAPP_TEMPLATE_LANGUAGE`: idioma do modelo, normalmente `pt_BR`.
- `WHATSAPP_GRAPH_VERSION`: versão Graph API ativa e suportada pelo app Meta.

O modelo aprovado precisa ter três variáveis de corpo na ordem: título, mensagem e link do imóvel. A campanha só envia para telefones com autorização WhatsApp registrada. Não use listas compradas ou contatos sem opt-in.

## Estrutura de dados

- `alertaDay/visitantes/{hash}`: coordenadas consentidas, validade, token Push e telefone cifrado/autorizações.
- `alertaDay/campanhas/{id}`: conteúdo, centro, raio, canais, contagens, estado e erros resumidos.

A localização expira em 90 dias e uma rotina periódica remove os registros vencidos. O endpoint de preferências permite excluir o registro do visitante, interrompendo novos envios para aquele identificador.

## Testes antes de ativar campanhas reais

1. Use um aparelho de teste e confirme o convite de localização em HTTPS.
2. Confirme que recusar localização não grava coordenadas.
3. Aceite localização e confira o registro no Realtime Database.
4. Ative Push e teste com um dispositivo de teste; confirme também o recebimento com o site em segundo plano.
5. Teste WhatsApp apenas com número interno autorizado e modelo aprovado.
6. Teste raios pequenos e grandes no painel e confira as contagens.
7. Confirme a exclusão de preferências e a limpeza de registros expirados.
8. Só então habilite campanhas reais, com revisão humana antes de cada disparo.

## Limitações conhecidas da primeira versão

- O público geográfico usa a localização mais recente compartilhada voluntariamente pelo navegador; não é rastreamento ao vivo.
- O círculo é centrado nas coordenadas do imóvel. Se o imóvel ainda não tiver coordenadas, o administrador pode clicar no mapa para posicionar o centro da campanha.
- O visitante sem localização autorizada ainda não entra em campanhas por raio.
- A interface de campanha inicial trabalha com imóvel, raio e canais Push/WhatsApp; filtros por preferências de preço/tipo e desenho de polígonos ficam para uma etapa posterior.
