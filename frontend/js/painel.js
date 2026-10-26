import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { categoryLabel, purposeLabel, safeText } from "./common.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let profile = null;
let carregandoPerfil = false;

const message = $("#panel-message");
const botaoAdmin = $("#btn-painel-admin");
const secaoNovoImovel = $("#novo-imovel");
const novoImovelNav = $("#novo-imovel-nav");

function definirMensagem(texto) { message.textContent = texto; }

function ehAdministradorAtivo(perfil) {
  return perfil?.papel === "administrador" && perfil?.ativo === true && perfil?.status === "ativo";
}

function ehUsuarioAtivo(perfil) {
  return perfil?.ativo === true && perfil?.status === "ativo";
}

function aplicarPermissoes(perfil) {
  const administrador = ehAdministradorAtivo(perfil);
  const usuarioAtivo = ehUsuarioAtivo(perfil);
  botaoAdmin.hidden = !administrador;
  secaoNovoImovel.hidden = !usuarioAtivo;
  novoImovelNav.hidden = !usuarioAtivo;
}

async function api(url, options = {}) {
  if (!currentUser) throw new Error("Faça login novamente.");
  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || (response.status === 401 || response.status === 403 ? "Você não tem autorização para esta operação." : "Falha na solicitação."));
  return data;
}

async function verificarPerfil() {
  botaoAdmin.hidden = true;
  secaoNovoImovel.hidden = true;
  novoImovelNav.hidden = true;
  const data = await api("/api/auth/perfil");
  profile = data.perfil || null;
  if (!profile) throw new Error("O perfil do usuário não foi encontrado.");
  aplicarPermissoes(profile);
  if (!ehUsuarioAtivo(profile)) {
    definirMensagem("Seu perfil está pendente ou inativo. Entre em contato com o administrador.");
    return false;
  }
  definirMensagem(ehAdministradorAtivo(profile) ? "Sessão ativa. Perfil de administrador autorizado." : "Sessão ativa. Perfil validado.");
  return true;
}

async function carregarImoveis() {
  const tabela = $("#property-table");
  tabela.innerHTML = `<tr><td colspan="5">Carregando imóveis…</td></tr>`;
  try {
    const response = await fetch("/api/imoveis");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar os imóveis.");
    const items = Array.isArray(data.items) ? data.items : [];
    $("#stat-total").textContent = items.length;
    $("#stat-publicados").textContent = items.length;
    // O painel comum não consulta métricas administrativas privadas.
    $("#stat-pendentes").textContent = "—";
    $("#stat-leads").textContent = "—";
    if (!items.length) {
      tabela.innerHTML = `<tr><td colspan="5">Nenhum imóvel publicado ainda.</td></tr>`;
      return;
    }
    tabela.innerHTML = items.map(imovel => `
      <tr>
        <td>${safeText(imovel.titulo || "Sem título")}</td>
        <td>${safeText(categoryLabel(imovel.categoria))}</td>
        <td>${safeText(purposeLabel(imovel.finalidade))}</td>
        <td>${safeText(imovel.status || "publicado")}</td>
        <td><a href="/detalhes.html?id=${encodeURIComponent(imovel.id)}">Ver ↗</a></td>
      </tr>`).join("");
  } catch (error) {
    tabela.innerHTML = `<tr><td colspan="5">${safeText(error.message)}</td></tr>`;
    $("#stat-total").textContent = "—";
    $("#stat-publicados").textContent = "—";
  }
}

async function load() {
  if (!currentUser || carregandoPerfil) return;
  carregandoPerfil = true;
  try {
    let perfilValido = false;
    try { perfilValido = await verificarPerfil(); }
    catch (error) { profile = null; aplicarPermissoes(null); definirMensagem(`Não foi possível validar seu perfil: ${error.message}`); }
    if (!perfilValido) {
      for (const id of ["stat-total", "stat-publicados", "stat-pendentes", "stat-leads"]) $("#" + id).textContent = "—";
      $("#property-table").innerHTML = `<tr><td colspan="5">Perfil não autorizado ou inativo.</td></tr>`;
      return;
    }
    await carregarImoveis();
  } finally { carregandoPerfil = false; }
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  profile = null;
  if (!user) { location.replace("/login.html"); return; }
  $("#welcome").textContent = `Conectado como ${user.email || user.uid}`;
  definirMensagem("Validando sessão e permissões…");
  await load();
});

$("#refresh").addEventListener("click", load);
$("#logout").addEventListener("click", async event => {
  event.preventDefault();
  try { await signOut(auth); } finally { location.replace("/login.html"); }
});

$("#property-form").addEventListener("submit", async event => {
  event.preventDefault();
  const feedback = $("#property-feedback");
  if (!ehUsuarioAtivo(profile)) { feedback.textContent = "Seu perfil não está autorizado a cadastrar imóveis."; return; }
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
