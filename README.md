# R&D PRIME IMÓVEIS — execução local e Render

## Estrutura esperada

- `server.js`
- `package.json`
- `frontend/` (HTML, CSS e JS públicos)
- `frontend/js/firebase-client.js` e `frontend/js/common.js` — mantenha os arquivos atuais do seu projeto
- `uploads/` é criado automaticamente para imagens enviadas

## Rodar no VS Code / Windows

1. Instale Node.js 20 ou mais recente.
2. Copie o `.env.example` para `.env` e ajuste os valores.
3. No `.env`, configure `GOOGLE_APPLICATION_CREDENTIALS` com o caminho absoluto para o JSON da conta de serviço Firebase Admin. Não coloque esse JSON dentro de `frontend/`.
4. No terminal do VS Code, na pasta do projeto, rode `npm install`.
5. Rode `npm run dev` (reinício automático) ou `npm start`.
6. Acesse `http://localhost:3000`.

O `firebase-client.js` do frontend continua usando a configuração pública do Firebase Web SDK. O JSON da conta de serviço é exclusivo do backend.

## Publicar no GitHub e Render

1. Envie o projeto ao GitHub, mas **não envie `.env` nem o JSON da conta de serviço**. O `.gitignore` já exclui esses arquivos.
2. No Render, crie um **Web Service** conectado ao repositório.
3. Configure **Build Command**: `npm install`.
4. Configure **Start Command**: `npm start`.
5. Em **Environment**, adicione:
   - `NODE_ENV` = `production`
   - `FIREBASE_DATABASE_URL` = `https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = conteúdo completo do JSON da conta de serviço, em uma única variável de ambiente; ou use `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` com o JSON codificado em Base64.
   - `MAX_UPLOAD_MB` = `12` (se usado pelo código)
   - `PUBLIC_BASE_URL` = URL pública do serviço Render, por exemplo `https://seu-servico.onrender.com`
6. Faça deploy. O servidor usa `process.env.PORT`, que o Render fornece automaticamente.

**Segurança:** nunca exponha a chave privada Firebase no GitHub, no frontend, em screenshots ou no chat. Se uma chave já foi publicada, revogue-a e gere outra no Firebase Console.

## Observações importantes

- O dashboard e as rotas administrativas continuam protegidos pelas permissões verificadas no backend. Para o administrador, o registro `usuarios/{uid}` deve conter `papel: "administrador"`, `ativo: true` e `status: "ativo"`.
- O painel comum não tem mais listagem, consulta ou navegação de usuários. A gestão de usuários fica em `admin.html`.
- O disco local de serviços hospedados pode ser efêmero. Para preservar fotos de imóveis após reinícios/deploys no Render, configure um Persistent Disk e ajuste o caminho de uploads, ou prefira armazenamento de objetos como Firebase Storage.
- Este pacote não inclui todos os arquivos estáticos originais do site. Copie/mantenha seus arquivos atuais dentro de `frontend/`, especialmente `css/style.css`, `js/firebase-client.js`, `js/common.js`, páginas públicas e login.
