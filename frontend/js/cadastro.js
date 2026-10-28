import { auth } from "./firebase-client.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#cadastro-form");
const feedback = document.querySelector("#cadastro-feedback");
const submitButton = form?.querySelector('button[type="submit"]');
let currentUser = null;
let submitting = false;

onAuthStateChanged(auth, user => { currentUser = user; });

const messages = {
  "auth/email-already-in-use": "Este e-mail já está cadastrado. Faça login.",
  "auth/invalid-email": "Informe um e-mail válido.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/operation-not-allowed": "Ative E-mail/Senha em Firebase Authentication → Sign-in method.",
  "auth/invalid-api-key": "A chave de configuração do Firebase está incorreta.",
  "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
};

function showMessage(text) {
  if (feedback) feedback.textContent = text;
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (submitting) return;

  const nome = document.querySelector("#nome")?.value.trim() || "";
  const telefone = document.querySelector("#telefone")?.value.trim() || "";
  const email = document.querySelector("#email")?.value.trim() || "";
  const password = document.querySelector("#password")?.value || "";
  const confirmation = document.querySelector("#confirm-password")?.value || "";

  if (!nome || !telefone || !email) return showMessage("Preencha todos os campos.");
  if (password.length < 6) return showMessage("A senha precisa ter pelo menos 6 caracteres.");
  if (password !== confirmation) return showMessage("As senhas não conferem.");

  submitting = true;
  if (submitButton) submitButton.disabled = true;
  showMessage(currentUser ? "Finalizando o cadastro…" : "Criando sua conta…");

  try {
    let user = currentUser;

    // Se a conta foi criada mas a API falhou, a próxima tentativa reutiliza
    // a sessão atual em vez de tentar criar a mesma conta novamente.
    if (!user) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      user = credential.user;
      currentUser = user;
      await updateProfile(user, { displayName: nome });
    } else if ((user.email || "").toLowerCase() !== email.toLowerCase()) {
      throw new Error("Já existe uma sessão aberta com outro e-mail. Saia da conta e tente novamente.");
    }

    const token = await user.getIdToken(true);
    const response = await fetch("/api/auth/registrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ nome, telefone })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar seu perfil.");

    await signOut(auth);
    currentUser = null;
    form.reset();
    showMessage("Cadastro concluído! Sua conta é de Cliente e você já pode navegar pelo site. Para acessar o painel profissional, o administrador precisa promover sua conta a Corretor.");
  } catch (error) {
    console.error("Falha no cadastro:", error);
    showMessage(messages[error.code] || error.message || "Não foi possível concluir o cadastro.");
  } finally {
    submitting = false;
    if (submitButton) submitButton.disabled = false;
  }
});
