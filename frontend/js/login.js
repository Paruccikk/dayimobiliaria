import { auth } from "./firebase-client.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#login-form");
const feedback = document.querySelector("#login-feedback");
const submitButton = form?.querySelector('button[type="submit"]');
let checking = false;

function message(text) {
  if (feedback) feedback.textContent = text;
}

function roleHome(role) {
  if (role === "administrador") return "/admin.html";
  if (role === "corretor") return "/painel.html";
  if (role === "cliente") return "/";
  return null;
}

async function validateAndRedirect(user) {
  if (!user || checking) return;
  checking = true;
  if (submitButton) submitButton.disabled = true;
  message("Validando sua conta e permissões…");

  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/perfil", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        await signOut(auth);
        message("Sua sessão expirou. Entre novamente.");
      } else {
        message(data.error || "Não foi possível validar sua conta. Tente novamente.");
      }
      return;
    }

    const profile = data.perfil;
    if (!profile || !["cliente", "corretor", "administrador"].includes(profile.papel)) {
      await signOut(auth);
      message("Seu perfil não está configurado corretamente. Procure o administrador.");
      return;
    }

    // Clientes usam somente o site público; não precisam de aprovação para navegar.
    if (profile.papel === "cliente") {
      window.location.replace("/");
      return;
    }

    if (profile.ativo !== true || profile.status !== "ativo") {
      await signOut(auth);
      message("Seu acesso profissional está pendente ou inativo. Entre em contato com o administrador.");
      return;
    }

    const destination = roleHome(profile.papel);
    if (destination) {
      window.location.replace(destination);
      return;
    }

    await signOut(auth);
    message("Seu perfil não tem permissão de acesso.");
  } catch (error) {
    console.error("Falha ao validar login:", error);
    message("Não foi possível consultar sua conta. Verifique a conexão e tente novamente.");
  } finally {
    checking = false;
    if (submitButton) submitButton.disabled = false;
  }
}

onAuthStateChanged(auth, user => {
  if (user) void validateAndRedirect(user);
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (checking) return;

  const email = document.querySelector("#email")?.value.trim();
  const password = document.querySelector("#password")?.value;
  if (!email || !password) {
    message("Informe seu e-mail e sua senha.");
    return;
  }

  if (submitButton) submitButton.disabled = true;
  message("Entrando…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged valida o papel consultando o servidor.
  } catch (error) {
    console.error("Falha no login:", error);
    const errors = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/user-not-found": "Não existe uma conta com esse e-mail.",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/invalid-email": "Informe um e-mail válido.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
    };
    message(errors[error.code] || "Não foi possível entrar. Confira os dados e tente novamente.");
    if (submitButton) submitButton.disabled = false;
  }
});
