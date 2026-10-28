import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { categoryLabel, purposeLabel, safeText } from "./common.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let profile = null;
let loading = false;

const message = $("#panel-message");
const adminButton = $("#btn-painel-admin");
const newPropertySection = $("#novo-imovel");
const newPropertyNav = $("#novo-imovel-nav");

function setMessage(text) { if (message) message.textContent = text; }
function isAdmin(p) { return p?.papel === "administrador" && p?.ativo === true && p?.status === "ativo"; }
function isProfessional(p) { return ["corretor", "administrador"].includes(p?.papel) && p?.ativo === true && p?.status === "ativo"; }
function applyPermissions(p) {
  if (adminButton) adminButton.hidden = !isAdmin(p);
  if (newPropertySection) newPropertySection.hidden = !isProfessional(p);
  if (newPropertyNav) newPropertyNav.hidden = !isProfessional(p);
}

async function api(url, options = {}) {
  if (!currentUser) throw new Error("Faça login novamente.");
  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Falha na solicitação (${response.status}).`);
  return data;
}

async function verifyProfile() {
  const data = await api("/api/auth/perfil");
  profile = data.perfil || null;
  if (!profile) throw new Error("Perfil não encontrado. Entre em contato com o administrador.");
  if (profile.papel === "cliente") {
    location.replace("/");
    return false;
  }
  if (!isProfessional(profile)) {
    throw new Error("Apenas corretores e administradores ativos podem acessar o painel.");
  }
  applyPermissions(profile);
  setMessage(isAdmin(profile) ? "Sessão ativa · Administrador" : "Sessão ativa · Corretor");
  return true;
}

async function loadProperties() {
  const table = $("#property-table");
  table.innerHTML = '<tr><td colspan="5">Carregando imóveis…</td></tr>';
  try {
    const response = await fetch("/api/imoveis");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar os imóveis.");
    const items = Array.isArray(data.items) ? data.items : [];
    $("#stat-total").textContent = items.length;
    $("#stat-publicados").textContent = items.length;
    $("#stat-pendentes").textContent = "—";
    $("#stat-leads").textContent = "—";
    table.innerHTML = items.length ? items.map(item => `
      <tr>
        <td>${safeText(item.titulo || "Sem título")}</td>
        <td>${safeText(categoryLabel(item.categoria))}</td>
        <td>${safeText(purposeLabel(item.finalidade))}</td>
        <td>${safeText(item.status || "publicado")}</td>
        <td><a href="/detalhes.html?id=${encodeURIComponent(item.id)}">Ver ↗</a></td>
      </tr>`).join("") : '<tr><td colspan="5">Nenhum imóvel publicado ainda.</td></tr>';
  } catch (error) {
    table.innerHTML = `<tr><td colspan="5">${safeText(error.message)}</td></tr>`;
    $("#stat-total").textContent = "—";
    $("#stat-publicados").textContent = "—";
  }
}

async function load() {
  if (!currentUser || loading) return;
  loading = true;
  try {
    const allowed = await verifyProfile();
    if (!allowed) return;
    await loadProperties();
  } catch (error) {
    applyPermissions(null);
    setMessage(error.message || "Não foi possível validar seu perfil.");
    $("#property-table").innerHTML = `<tr><td colspan="5">${safeText(error.message)}</td></tr>`;
  } finally {
    loading = false;
  }
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  profile = null;
  if (!user) { location.replace("/login.html"); return; }
  $("#welcome").textContent = `Conectado como ${user.email || user.uid}`;
  setMessage("Validando sessão e permissões…");
  await load();
});

$("#refresh")?.addEventListener("click", load);
$("#logout")?.addEventListener("click", async event => {
  event.preventDefault();
  try { await signOut(auth); } finally { location.replace("/login.html"); }
});

$("#property-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const feedback = $("#property-feedback");
  if (!isProfessional(profile)) { feedback.textContent = "Somente corretores e administradores ativos podem cadastrar imóveis."; return; }
  const ids = ["titulo", "categoria", "finalidade", "preco", "cidade", "estado", "bairro", "areaM2", "quartos", "suites", "banheiros", "vagas", "descricao"];
  const body = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value]));
  feedback.textContent = "Salvando imóvel…";
  try {
    const data = await api("/api/admin/imoveis", { method: "POST", body: JSON.stringify(body) });
    feedback.textContent = `Imóvel cadastrado. ID: ${data.id}. Aguarda aprovação.`;
    event.target.reset();
    await load();
  } catch (error) { feedback.textContent = error.message; }
});
