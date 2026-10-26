
import { auth } from "./firebase-client.js";

import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#cadastro-form");
const feedback = document.querySelector("#cadastro-feedback");
const submit = form.querySelector('button[type="submit"]');

const mensagens = {
  "auth/email-already-in-use":
    "Este e-mail já está cadastrado. Tente entrar pela página de login.",

  "auth/invalid-email":
    "Informe um e-mail válido.",

  "auth/weak-password":
    "Escolha uma senha com pelo menos 6 caracteres.",

  "auth/operation-not-allowed":
    "Ative o método E-mail/Senha em Firebase Authentication → Sign-in method.",

  "auth/invalid-api-key":
    "A API key do Firebase está incorreta. Confira firebase-client.js.",

  "auth/network-request-failed":
    "Falha de conexão. Verifique sua internet e tente novamente."
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nome = document.querySelector("#nome").value.trim();
  const telefone = document.querySelector("#telefone").value.trim();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const confirmPassword =
    document.querySelector("#confirm-password").value;

  feedback.textContent = "";

  if (!nome || !telefone || !email) {
    feedback.textContent = "Preencha todos os campos.";
    return;
  }

  if (password.length < 6) {
    feedback.textContent =
      "A senha precisa ter pelo menos 6 caracteres.";
    return;
  }

  if (password !== confirmPassword) {
    feedback.textContent = "As senhas não conferem.";
    return;
  }

  submit.disabled = true;
  feedback.textContent = "Enviando solicitação...";

  let createdUser = null;
  let profileSaved = false;

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    createdUser = credential.user;

    await updateProfile(createdUser, {
      displayName: nome
    });

    const token = await createdUser.getIdToken(true);

    const response = await fetch("/api/auth/registrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        nome,
        telefone
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error || "Não foi possível salvar o cadastro no servidor."
      );
    }

    profileSaved = true;

    await signOut(auth);

    form.reset();

    feedback.textContent =
      "Cadastro recebido! Seu perfil inicial é Cliente. " +
      "Aguarde a aprovação do administrador.";

  } catch (error) {
    console.error("Erro no cadastro:", error);

    if (createdUser && !profileSaved) {
      feedback.textContent =
        "A conta foi criada no Firebase Authentication, mas o perfil " +
        "não foi salvo no sistema. Não tente cadastrar novamente com " +
        "outro e-mail. Procure o administrador para regularizar o cadastro. " +
        "Detalhe: " + (error.message || "erro desconhecido");
    } else {
      feedback.textContent =
        mensagens[error.code] ||
        error.message ||
        "Não foi possível concluir o cadastro.";
    }

  } finally {
    submit.disabled = false;
  }
});
