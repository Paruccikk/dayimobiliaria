
import { auth } from "../firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#login-form");
const feedback = document.querySelector("#login-feedback");
const submitButton = form?.querySelector('button[type="submit"]');

let checking = false;
let redirecting = false;

function message(text) {
  if (feedback) feedback.textContent = text;
}

function setLoading(loading) {
  if (submitButton) {
    submitButton.disabled = loading;
  }
}

function roleHome(role) {
  const destinations = {
    administrador: "/admin.html",
    corretor: "/painel.html",
    cliente: "/"
  };

  return destinations[role] || null;
}

async function validateAndRedirect(user) {
  if (!user || checking || redirecting) return;

  checking = true;
  setLoading(true);
  message("Validando sua conta e permissões...");

  try {
    const token = await user.getIdToken();

    const response = await fetch("/api/auth/perfil", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        await signOut(auth);
        message("Sua sessão expirou. Entre novamente.");
      } else {
        console.error("Erro ao consultar perfil:", response.status, data);
        message(
          data.error ||
          "Não foi possível validar sua conta. Tente novamente."
        );
      }
      return;
    }

    const profile = data.perfil;

    const allowedRoles = [
      "cliente",
      "corretor",
      "administrador"
    ];

    if (!profile || !allowedRoles.includes(profile.papel)) {
      await signOut(auth);
      message(
        "Seu perfil não está configurado corretamente. Procure o administrador."
      );
      return;
    }

    // Clientes podem acessar o site público.
    if (profile.papel === "cliente") {
      redirecting = true;
      window.location.replace("/");
      return;
    }

    // Corretores e administradores precisam estar ativos.
    if (profile.ativo !== true || profile.status !== "ativo") {
      await signOut(auth);
      message(
        "Seu acesso profissional está pendente ou inativo. Entre em contato com o administrador."
      );
      return;
    }

    const destination = roleHome(profile.papel);

    if (!destination) {
      await signOut(auth);
      message("Seu perfil não tem permissão de acesso.");
      return;
    }

    redirecting = true;
    window.location.replace(destination);

  } catch (error) {
    console.error("Falha ao validar login:", error);

    message(
      "Não foi possível consultar sua conta. Verifique a conexão e tente novamente."
    );
  } finally {
    checking = false;

    if (!redirecting) {
      setLoading(false);
    }
  }
}

// Detecta uma sessão existente ou o login recém-realizado.
onAuthStateChanged(auth, user => {
  if (user) {
    void validateAndRedirect(user);
  }
});

form?.addEventListener("submit", async event => {
  event.preventDefault();

  if (checking || redirecting) return;

  const email = document.querySelector("#email")?.value.trim();
  const password = document.querySelector("#password")?.value;

  if (!email || !password) {
    message("Informe seu e-mail e sua senha.");
    return;
  }

  setLoading(true);
  message("Entrando...");

  try {
    await signInWithEmailAndPassword(auth, email, password);

    // A validação e o redirecionamento ficam a cargo
    // do onAuthStateChanged.
  } catch (error) {
    console.error("Falha no login:", error);

    const errors = {
      "auth/invalid-credential":
        "E-mail ou senha incorretos.",
      "auth/user-not-found":
        "Não existe uma conta com esse e-mail.",
      "auth/wrong-password":
        "E-mail ou senha incorretos.",
      "auth/invalid-email":
        "Informe um e-mail válido.",
      "auth/too-many-requests":
        "Muitas tentativas. Aguarde alguns minutos.",
      "auth/network-request-failed":
        "Falha de conexão. Verifique sua internet.",
      "auth/invalid-api-key":
        "A configuração do Firebase está inválida."
    };

    message(
      errors[error.code] ||
      "Não foi possível entrar. Confira os dados e tente novamente."
    );

    setLoading(false);
  }
});
