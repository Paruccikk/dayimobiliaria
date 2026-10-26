# Backend e Firebase

## Configuração
1. Copie `.env.example` para `.env`.
2. Configure uma conta de serviço do Firebase no ambiente do servidor usando `GOOGLE_APPLICATION_CREDENTIALS`. Não coloque o JSON dentro de `frontend/` nem no Git.
3. No Firebase Console, habilite Authentication (Email/Password) e Realtime Database.
4. Cadastre um perfil de usuário em `usuarios/{uid}` com `papel` (`administrador`, `socio` ou `corretor`) e `ativo: true`.
5. O token ID do Firebase Authentication deve ser enviado nas rotas administrativas como `Authorization: Bearer <idToken>`.

## Estrutura de dados sugerida
- `usuarios/{uid}`: nome, email, papel, ativo, telefone
- `imoveis/{id}`: titulo, categoria, finalidade, preco, descricao, fotos[], status, publicadoNoSite, responsavelUid
- `leads/{id}`: nome, telefone, mensagem, imovelId, origem, status, criadoEm

As rotas são um ponto de partida e precisam de testes de integração, regras de negócio completas e configuração de produção antes de publicar.
