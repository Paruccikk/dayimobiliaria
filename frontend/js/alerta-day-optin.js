import { app } from "../firebase-config.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const KEY = "rdprime.alertaDay.visitor.v1";
const DECISION = "rdprime.alertaDay.invite.v1";
const $ = (tag, attrs = {}, text = "") => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "type") node.type = value;
    else node.setAttribute(key, value);
  });
  if (text) node.textContent = text;
  return node;
};
function visitorId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "rd-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(KEY, id);
  }
  return id;
}
async function post(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar sua preferência.");
  return data;
}
function buildModal() {
  const overlay = $("div", { className: "ad-visitor-overlay", id: "ad-visitor-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "ad-visitor-title" });
  const panel = $("section", { className: "ad-visitor-panel" });
  const close = $("button", { className: "ad-visitor-close", type: "button", "aria-label": "Fechar" }, "×");
  close.addEventListener("click", () => { localStorage.setItem(DECISION, "deferred"); overlay.remove(); });
  const mark = $("div", { className: "ad-visitor-mark" }, "DAY");
  const title = $("h2", { id: "ad-visitor-title" }, "Descubra oportunidades perto de você");
  const copy = $("p", {}, "Compartilhe sua localização para receber alertas de imóveis na região que escolher. Você decide se quer ativar e pode retirar sua autorização quando quiser. No iPhone, adicione o site à Tela de Início para habilitar notificações Push.");
  const privacy = $("p", { className: "ad-visitor-privacy" }, "Usaremos a localização autorizada para calcular a proximidade de imóveis. Não rastreamos seus deslocamentos. Os dados de localização expiram em até 90 dias ou antes, se você retirar a autorização.");
  const feedback = $("p", { className: "ad-visitor-feedback", role: "status", "aria-live": "polite" });
  const location = $("button", { className: "ad-visitor-primary", type: "button" }, "Permitir uso da minha localização");
  const later = $("button", { className: "ad-visitor-secondary", type: "button" }, "Agora não");
  const remove = $("button", { className: "ad-visitor-remove", type: "button" }, "Remover meus dados e cancelar alertas");
  const push = $("button", { className: "ad-visitor-primary", type: "button" }, "Ativar notificações no celular");
  const whatsappForm = $("form", { className: "ad-visitor-whatsapp" });
  const whatsappTitle = $("h3", {}, "Prefere receber pelo WhatsApp?");
  const phone = $("input", { type: "tel", inputmode: "tel", autocomplete: "tel", placeholder: "(11) 99999-9999", maxlength: "20", "aria-label": "Seu WhatsApp" });
  const consentLabel = $("label", { className: "ad-visitor-consent" });
  const consent = $("input", { type: "checkbox", required: "required" });
  consentLabel.append(consent, document.createTextNode(" Aceito receber ofertas de imóveis da Day Imobiliária pelo WhatsApp. Posso cancelar quando quiser."));
  const submit = $("button", { className: "ad-visitor-secondary", type: "submit" }, "Autorizar WhatsApp");
  whatsappForm.append(whatsappTitle, phone, consentLabel, submit);
  push.hidden = true;
  whatsappForm.hidden = true;
  panel.append(close, mark, title, copy, privacy, location, feedback, push, whatsappForm, later, remove);
  overlay.append(panel);
  document.body.append(overlay);
  later.addEventListener("click", () => { localStorage.setItem(DECISION, "deferred"); overlay.remove(); });
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      const response = await fetch("/api/alerta-day/preferencias", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId: visitorId() }) });
      if (!response.ok) throw new Error("Falha ao remover as preferências.");
      localStorage.removeItem(KEY);
      localStorage.setItem(DECISION, "deferred");
      feedback.textContent = "Suas preferências foram removidas e os envios para este cadastro foram interrompidos.";
      location.disabled = true; push.disabled = true; submit.disabled = true; remove.textContent = "Preferências removidas";
    } catch (error) { feedback.textContent = "Não foi possível remover agora. Tente novamente."; remove.disabled = false; }
  });
  location.addEventListener("click", () => {
    if (!navigator.geolocation) { feedback.textContent = "Seu navegador não disponibiliza localização. Para receber alertas por proximidade, tente em um navegador compatível."; return; }
    location.disabled = true;
    feedback.textContent = "Aguardando sua autorização de localização…";
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        await post("/api/alerta-day/localizacao", { visitorId: visitorId(), consentimento: true, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        localStorage.setItem(DECISION, "location-accepted");
        feedback.textContent = "Localização autorizada. Agora escolha se deseja receber notificações no celular ou WhatsApp.";
        location.hidden = true;
        push.hidden = false;
        whatsappForm.hidden = false;
        later.textContent = "Concluir";
      } catch (error) { feedback.textContent = error.message; location.disabled = false; }
    }, error => {
      localStorage.setItem(DECISION, "deferred");
      feedback.textContent = error.code === 1 ? "Você não autorizou a localização. Não salvamos nenhuma coordenada. Se quiser, pode tentar novamente nas permissões do navegador." : "Não conseguimos obter sua localização. Verifique as permissões do navegador e tente novamente.";
      location.disabled = false;
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
  push.addEventListener("click", async () => {
    push.disabled = true;
    try {
      if (!(await isSupported())) throw new Error("Este navegador não oferece suporte a notificações Push.");
      const config = await fetch("/api/alerta-day/config").then(r => r.json());
      if (!config.vapidKey) throw new Error("As notificações ainda estão em configuração. Você pode escolher WhatsApp.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permissão de notificações não concedida.");
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
      await post("/api/alerta-day/push", { visitorId: visitorId(), consentimento: true, token });
      feedback.textContent = "Notificações ativadas! Você poderá receber oportunidades da Day.";
      push.textContent = "Notificações ativadas";
    } catch (error) { feedback.textContent = error.message; push.disabled = false; }
  });
  whatsappForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!consent.checked) { feedback.textContent = "Marque a autorização para continuar."; return; }
    submit.disabled = true;
    try {
      await post("/api/alerta-day/whatsapp", { visitorId: visitorId(), telefone: phone.value, consentimento: true });
      feedback.textContent = "Autorização do WhatsApp registrada. Obrigado!";
      submit.textContent = "WhatsApp autorizado";
    } catch (error) { feedback.textContent = error.message; submit.disabled = false; }
  });
  return overlay;
}
function addPreferencesLink() {
  const footer = document.querySelector(".copyright");
  if (!footer || document.getElementById("ad-manage-preferences")) return;
  const button = $("button", { id: "ad-manage-preferences", className: "ad-manage-preferences", type: "button" }, "Preferências de alertas");
  button.addEventListener("click", () => {
    localStorage.removeItem(DECISION);
    const old = document.getElementById("ad-visitor-overlay");
    if (old) old.remove();
    buildModal();
  });
  footer.append(document.createTextNode(" · "), button);
}
async function init() {
  if (!window.isSecureContext) return;
  addPreferencesLink();
  if (!localStorage.getItem(DECISION)) {
    window.setTimeout(() => { if (!document.getElementById("ad-visitor-overlay")) buildModal(); }, 1800);
  }
}
init();
