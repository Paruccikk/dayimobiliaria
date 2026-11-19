import { auth, app } from "./firebase-client.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.querySelector("#cadastro-form");
const feedback = document.querySelector("#cadastro-feedback");
const submitButton = form?.querySelector('button[type="submit"]');
const celularInput = document.querySelector("#celular");
let currentUser = null;
let submitting = false;

onAuthStateChanged(auth, user => { currentUser = user; });

// Máscara automática para WhatsApp
if (celularInput) {
  celularInput.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 10) {
      v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
    } else if (v.length > 6) {
      v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
    }
    e.target.value = v;
  });
}

const messages = {
  "auth/email-already-in-use": "Este e-mail já está cadastrado. Faça login.",
  "auth/invalid-email": "Informe um e-mail válido.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/operation-not-allowed": "Ative E-mail/Senha no Firebase Authentication.",
  "auth/invalid-api-key": "A chave de configuração do Firebase está incorreta.",
  "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
};

function showMessage(text, isSuccess = false) {
  if (!feedback) return;
  feedback.textContent = text;
  feedback.style.color = isSuccess ? "var(--gold-2, #c9a45c)" : "#f06ca8";
}

function alertaDayVisitorId() {
  const key = "rdprime.alertaDay.visitor.v1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "rd-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}

let cachedCoords = null;
function requestProactiveLocation() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      cachedCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
    },
    () => {},
    { timeout: 20000, maximumAge: 60000, enableHighAccuracy: true }
  );
}

// Só solicita localização quando a pessoa marca a autorização específica.
const locationConsentInput = document.querySelector("#consentimento-localizacao");
if (locationConsentInput?.checked) requestProactiveLocation();
locationConsentInput?.addEventListener("change", e => {
  if (e.target.checked && !cachedCoords) requestProactiveLocation();
});

function getCoordinates() {
  if (cachedCoords) return Promise.resolve(cachedCoords);
  return new Promise(resolve => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        cachedCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        resolve(cachedCoords);
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
    );
  });
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (submitting) return;

  const nome = document.querySelector("#nome")?.value.trim() || "";
  const celular = document.querySelector("#celular")?.value.trim() || "";
  const email = document.querySelector("#email")?.value.trim() || "";
  const password = document.querySelector("#password")?.value || "";
  const confirmation = document.querySelector("#confirm-password")?.value || "";
  const consentimentoWhatsApp = document.querySelector("#consentimento-whatsapp")?.checked === true;
  const consentimentoEmail = document.querySelector("#consentimento-email")?.checked === true;
  const consentimentoPush = document.querySelector("#consentimento-push")?.checked === true;
  const consentimentoPrivacidade = document.querySelector("#consentimento-privacidade")?.checked === true;
  const endereco = document.querySelector("#endereco")?.value.trim() || "";
  const consentimentoLocalizacao = document.querySelector("#consentimento-localizacao")?.checked === true;

  if (!nome || !email) return showMessage("Preencha nome e e-mail.");
  if (!consentimentoPrivacidade) return showMessage("É necessário aceitar as Políticas de Privacidade para criar a conta.");
  if (consentimentoWhatsApp && celular.replace(/\D/g, "").length < 10) return showMessage("Informe um WhatsApp válido com DDD ou desmarque essa autorização.");
  if (password.length < 6) return showMessage("A senha precisa ter pelo menos 6 caracteres.");
  if (password !== confirmation) return showMessage("As senhas não conferem.");

  submitting = true;
  if (submitButton) submitButton.disabled = true;
  showMessage(currentUser ? "Finalizando cadastro…" : "Criando sua conta…");

  try {
    let coords = null;
    if (consentimentoLocalizacao) {
      coords = await getCoordinates();
    }

    let user = currentUser;
    if (!user) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      user = credential.user;
      currentUser = user;
      await updateProfile(user, { displayName: nome });
    } else if ((user.email || "").toLowerCase() !== email.toLowerCase()) {
      throw new Error("Já existe uma sessão aberta com outro e-mail. Saia da conta e tente novamente.");
    }

    const token = await user.getIdToken(true);
    const visitorId = alertaDayVisitorId();
    const response = await fetch("/api/auth/registrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nome,
        celular,
        telefone: celular,
        endereco,
        consentimentoPrivacidade,
        consentimentoEmail,
        consentimentoWhatsApp,
        consentimentoLocalizacao,
        visitorId,
        ...(coords || {})
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar seu perfil.");

    if (consentimentoPush) {
      try {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("Este navegador não oferece notificações Push.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Permissão de notificações não concedida.");
        const configResponse = await fetch("/api/alerta-day/config");
        const config = await configResponse.json();
        if (!config.vapidKey) throw new Error("Chave de notificações indisponível.");
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const messaging = getMessaging(app);
        const pushToken = await getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
        if (!pushToken) throw new Error("Não foi possível gerar o token de notificações.");
        const pushResponse = await fetch("/api/alerta-day/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorId, token: pushToken, consentimento: true })
        });
        if (!pushResponse.ok) throw new Error("Não foi possível ativar as notificações no servidor.");
      } catch (pushError) {
        console.warn("[Alerta Day] Cadastro concluído, mas o Push não foi ativado:", pushError.message);
        showMessage("Cadastro realizado. Não foi possível ativar o Push: " + pushError.message, true);
      }
    }

    await signOut(auth);
    currentUser = null;
    form.reset();
    showMessage("Cadastro realizado com sucesso! Redirecionando para login...", true);
    setTimeout(() => {
      window.location.href = "/login.html";
    }, 1500);
  } catch (error) {
    console.error("Falha no cadastro:", error);
    showMessage(messages[error.code] || error.message || "Não foi possível concluir o cadastro.");
  } finally {
    submitting = false;
    if (submitButton) submitButton.disabled = false;
  }
});
