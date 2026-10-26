import { auth } from "./firebase-client.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const form = document.querySelector("#login-form");
const feedback = document.querySelector("#login-feedback");
onAuthStateChanged(auth, user => { if (user) location.replace("/painel.html"); });
form.addEventListener("submit", async e => {
  e.preventDefault();
  feedback.textContent = "Validando acesso…";
  try {
    await signInWithEmailAndPassword(auth, document.querySelector("#email").value.trim(), document.querySelector("#password").value);
    location.href = "/painel.html";
  } catch (_err) { feedback.textContent = "Não foi possível entrar. Confira e-mail e senha ou solicite acesso ao administrador."; }
});
