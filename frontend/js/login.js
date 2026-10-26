
import { auth } from "./firebase-client.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#login-form");
const feedback = document.querySelector("#login-feedback");

let verificandoSessao = false;

function mostrarMensagem(mensagem) {
  if (feedback) {
    feedback.textContent = mensagem;
  }
}

async function validarPerfilEEncaminhar(user) {
  if (!user || verificandoSessao) return;

  verificandoSessao = true;
  mostrarMensagem("Validando sessão e consultando perfil…");

  try {
    // Obtém o token da sessão atual do Firebase.
    const token = await user.getIdToken();

    // Envia o token ao servidor para consultar o perfil no banco.
    const resposta = await fetch("/api/auth/perfil", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      console.error(
        "Falha ao consultar perfil:",
        resposta.status,
        dados
      );

      if (resposta.status === 401) {
        await signOut(auth);
        mostrarMensagem(
          "Sua sessão expirou ou não pôde ser validada. Entre novamente."
        );
        return;
      }

      mostrarMensagem(
        "Não foi possível validar a sessão e consultar o perfil. " +
        "Tente novamente em instantes."
      );
      return;
    }

    const perfil = dados.perfil;

    if (!perfil) {
      console.error("Resposta da API sem perfil:", dados);
      mostrarMensagem(
        "O servidor não retornou o perfil do usuário. " +
        "Verifique a configuração da API."
      );
      return;
    }

    // O acesso exige perfil ativo e aprovado.
    const perfilAtivo =
      perfil.ativo === true &&
      perfil.status === "ativo";

    if (!perfilAtivo) {
      await signOut(auth);
      mostrarMensagem(
        "Seu cadastro ainda está aguardando aprovação ou está inativo. " +
        "Entre em contato com o administrador."
      );
      return;
    }

    // Direciona conforme o papel confirmado pelo servidor.
    if (perfil.papel === "administrador") {
      window.location.replace("/admin.html");
      return;
    }

    if (
      perfil.papel === "corretor" ||
      perfil.papel === "cliente"
    ) {
      window.location.replace("/painel.html");
      return;
    }

    console.error("Papel de usuário não reconhecido:", perfil.papel);

    await signOut(auth);
    mostrarMensagem(
      "Seu perfil não possui um tipo de acesso reconhecido. " +
      "Entre em contato com o administrador."
    );
  } catch (erro) {
    console.error("Erro ao validar sessão e perfil:", erro);

    mostrarMensagem(
      "Não foi possível validar a sessão e consultar o perfil. " +
      "Verifique sua conexão e tente novamente."
    );
  } finally {
    verificandoSessao = false;
  }
}

// Se já houver sessão, valida o perfil antes de redirecionar.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await validarPerfilEEncaminhar(user);
  }
});

form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (verificandoSessao) return;

  const email = document.querySelector("#email")?.value.trim();
  const senha = document.querySelector("#password")?.value;

  if (!email || !senha) {
    mostrarMensagem("Informe seu e-mail e sua senha.");
    return;
  }

  mostrarMensagem("Autenticando no Firebase…");

  try {
    await signInWithEmailAndPassword(auth, email, senha);

    // O onAuthStateChanged fará a consulta do perfil.
    mostrarMensagem("Login realizado. Validando suas permissões…");
  } catch (erro) {
    console.error("Erro no login:", erro);

    mostrarMensagem(
      "Não foi possível entrar. Confira e-mail e senha " +
      "ou solicite acesso ao administrador."
    );
  }
});
