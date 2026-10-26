
## Cadastro e aprovação de corretores

O formulário de cadastro pode enviar `tipoCadastro: "corretor"` para `/api/auth/registrar`. O servidor registra `solicitacaoPapel: "corretor"`, mas mantém `papel: "cliente"`, `ativo: false` e `status: "pendente"` até o administrador aprovar. No dashboard administrativo, o administrador deve alterar o papel para `corretor` e ativar a conta. Contas de administrador existentes continuam usando `papel: "administrador"`, `ativo: true` e `status: "ativo"`.

A rota `GET /api/auth/perfil` agora retorna também perfis pendentes para que a tela de login possa decidir qual mensagem/rota mostrar. As rotas protegidas continuam exigindo conta ativa.

**Atenção:** o ZIP de correção não contém `login.html`, `frontend/js/login.js` nem a página de cadastro original, porque esses arquivos não estavam no pacote fornecido. Para corrigir completamente o redirecionamento automático e adaptar o formulário de cadastro, é necessário editar o JS real do login/cadastro para usar `GET /api/auth/perfil` e enviar `tipoCadastro`.
