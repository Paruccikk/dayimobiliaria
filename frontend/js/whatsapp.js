import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
const accessCheck = $("#wa-access-check");
const app = $("#wa-app");
const accessFeedback = $("#wa-access-feedback");
const badge = $("#wa-badge");
const stateText = $("#wa-state");
const updated = $("#wa-updated");
const qr = $("#wa-qr");
const qrPlaceholder = $("#wa-qr-placeholder");
const qrTitle = $("#wa-qr-title");
const qrHelp = $("#wa-qr-help");
const connectButton = $("#wa-connect");
const disconnectButton = $("#wa-disconnect");
const refreshButton = $("#wa-refresh");
const feedback = $("#wa-feedback");
let currentUser = null;
let pollTimer = null;

function message(element, value) { if (element) element.textContent = value || ""; }
function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(date);
}
async function api(url, options = {}) {
  if (!currentUser) throw new Error("Sessão não autenticada.");
  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type":"application/json", Authorization:`Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}
function renderStatus(data = {}) {
  const status = data.status || "desconectado";
  const labels = {
    conectado:"Conectado",
    qr:"Aguardando leitura do QR Code",
    conectando:"Conectando",
    desconectado:"Desconectado",
    erro:"Erro na conexão",
    indisponivel:"Integração indisponível"
  };
  badge.dataset.state = status;
  stateText.textContent = labels[status] || status;
  updated.textContent = dateLabel(data.updatedAt);
  connectButton.hidden = status === "conectado";
  disconnectButton.hidden = !["conectado","qr","conectando"].includes(status);
  connectButton.disabled = ["qr","conectando"].includes(status);
  if (data.qrDataUrl && status === "qr") {
    qr.src = data.qrDataUrl;
    qr.hidden = false;
    qrPlaceholder.hidden = true;
  } else {
    qr.removeAttribute("src");
    qr.hidden = true;
    qrPlaceholder.hidden = false;
    qrTitle.textContent = status === "conectado" ? "WhatsApp conectado" : status === "indisponivel" ? "Integração não instalada" : status === "erro" ? "Não foi possível conectar" : "WhatsApp não conectado";
    qrHelp.textContent = data.message || (status === "conectado" ? "A sessão está ativa neste servidor." : "Clique em conectar para gerar um QR Code.");
  }
}
async function refreshStatus() {
  if (!currentUser) return;
  try { renderStatus(await api("/api/admin/whatsapp/status")); }
  catch (error) { badge.dataset.state = "erro"; stateText.textContent = "Status indisponível"; message(feedback, error.message); }
}
async function connect() {
  connectButton.disabled = true;
  message(feedback, "Preparando a conexão e gerando o QR Code…");
  try {
    const data = await api("/api/admin/whatsapp/conectar", { method:"POST", body:"{}" });
    renderStatus(data);
    message(feedback, data.status === "qr" ? "Leia o QR Code pelo WhatsApp no celular." : "Solicitação de conexão enviada. O status será atualizado automaticamente.");
  } catch (error) { message(feedback, error.message); }
  finally { connectButton.disabled = false; }
}
async function disconnect() {
  if (!window.confirm("Deseja desconectar e remover a sessão salva deste WhatsApp?")) return;
  disconnectButton.disabled = true;
  try {
    renderStatus(await api("/api/admin/whatsapp/desconectar", { method:"POST", body:"{}" }));
    message(feedback, "Sessão desconectada. Gere um novo QR Code para conectar novamente.");
  } catch (error) { message(feedback, error.message); }
  finally { disconnectButton.disabled = false; }
}
connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", disconnect);
refreshButton.addEventListener("click", refreshStatus);
$("#wa-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("/login.html");
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (pollTimer) clearInterval(pollTimer);
  if (!user) { window.location.replace("/login.html"); return; }
  try {
    const result = await api("/api/auth/perfil");
    const profile = result.perfil;
    if (!profile || profile.papel !== "administrador" || profile.ativo !== true || profile.status !== "ativo") {
      message(accessFeedback, "Acesso negado. Esta página é exclusiva para administradores ativos.");
      window.location.replace(profile?.papel === "corretor" ? "/painel.html" : "/");
      return;
    }
    accessCheck.hidden = true;
    app.hidden = false;
    await refreshStatus();
    pollTimer = setInterval(() => void refreshStatus(), 8000);
  } catch (error) {
    message(accessFeedback, error.message || "Não foi possível validar suas permissões.");
    setTimeout(() => window.location.replace("/login.html"), 1400);
  }
});
