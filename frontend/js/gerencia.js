import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let loading = false;
let managerProperties = [];
let managerSearchTerm = "";
let brokerSearchTerm = "";
let performanceSearchTerm = "";
let leadSearchTerm = "";
let managerTeam = [];
let managerPerformance = [];
let managerLeads = [];

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const money = value => value == null || value === "" ? "—" :
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value));
const date = value => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? esc(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
};
async function api(url) {
  const token = await currentUser.getIdToken();
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha ao consultar o painel.");
  return data;
}
function rows(selector, items, empty, render, colspan) {
  const target = $(selector);
  target.innerHTML = items.length ? items.map(render).join("") : '<tr><td colspan="' + colspan + '">' + empty + '</td></tr>';
}
const normalizeSearch = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function renderManagerTeam() {
  const q = normalizeSearch(brokerSearchTerm.trim());
  const filtered = q ? managerTeam.filter(user => normalizeSearch([user.nome, user.email, user.telefone, user.uid].join(" ")).includes(q)) : managerTeam;
  rows("#manager-team", filtered, "Nenhum corretor encontrado para essa busca.", user => {
    const ownProperties = managerProperties.filter(item => item.responsavelUid === user.uid || item.responsavelTipo === "todos").length;
    const ownLeads = managerLeads.filter(item => item.responsavelUid === user.uid).length;
    return '<tr><td><strong>' + esc(user.nome) + '</strong></td><td>' + esc(user.email || "—") + '</td><td>' + ownProperties + '</td><td>' + ownLeads + '</td></tr>';
  }, 4);
}
function renderManagerPerformance() {
  const q = normalizeSearch(performanceSearchTerm.trim());
  const filtered = q ? managerPerformance.filter(item => normalizeSearch([item.nome, item.email].join(" ")).includes(q)) : managerPerformance;
  rows("#manager-performance", filtered, "Nenhum corretor encontrado para essa busca.", item => '<tr><td><strong>' + esc(item.nome) + '</strong></td><td>' + item.imoveis + '</td><td>' + item.leads + '</td><td>' + item.leadsNovos + '</td><td>' + item.propostas + '</td><td>' + item.fechados + '</td><td>' + item.visitas + '</td><td>' + item.visitasRealizadas + '</td></tr>', 8);
}
function renderManagerLeads() {
  const q = normalizeSearch(leadSearchTerm.trim());
  const filtered = q ? managerLeads.filter(lead => normalizeSearch([lead.nome, lead.telefone, lead.email, lead.imovelId, lead.mensagem, lead.preferencias, lead.status, lead.responsavelNome].join(" ")).includes(q)) : managerLeads.slice(0, 100);
  rows("#manager-leads", filtered, "Nenhum lead encontrado para essa busca.", lead => '<tr><td><strong>' + esc(lead.nome || "—") + '</strong><div class="dash-subtitle">' + esc(lead.mensagem || "") + '</div></td><td>' + esc(lead.telefone || "—") + '</td><td>' + esc(lead.responsavelNome) + '</td><td>' + esc(lead.status || "novo") + '</td><td>' + date(lead.criadoEm) + '</td></tr>', 5);
}
function renderManagerProperties() {
  const target = $("#manager-properties");
  const normalize = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = normalize(managerSearchTerm.trim());
  const filtered = query ? managerProperties.filter(item => normalize([item.titulo, item.id, item.cidade, item.estado, item.bairro, item.regiao, item.finalidade, item.status, item.responsavelNome, item.responsavelUid].join(" ")).includes(query)) : managerProperties;
  if (!managerProperties.length) { target.innerHTML = '<tr><td colspan="5">Nenhum imóvel na carteira da equipe.</td></tr>'; return; }
  if (!filtered.length) { target.innerHTML = '<tr><td colspan="5">Nenhum imóvel encontrado para essa busca.</td></tr>'; return; }
  target.innerHTML = filtered.map(item => '<tr><td><strong>' + esc(item.titulo || "Sem título") + '</strong><div class="dash-subtitle">' + esc(item.cidade || "") + '</div></td><td>' + esc(item.finalidade || "—") + '</td><td>' + money(item.preco) + '</td><td>' + esc(item.responsavelNome) + '</td><td>' + esc(item.status || "—") + '</td></tr>').join("");
}
async function load() {
  if (!currentUser || loading) return;
  loading = true;
  $("#manager-feedback").textContent = "Carregando dados da equipe…";
  try {
    const profileData = await api("/api/auth/perfil");
    const profile = profileData.perfil;
    if (!profile || !["gerente", "administrador"].includes(profile.papel) || profile.ativo !== true || profile.status !== "ativo") {
      window.location.replace("/painel.html");
      return;
    }
    $("#manager-welcome").textContent = "Conectado como " + (profile.nome || currentUser.email) + (profile.papel === "administrador" ? " · Administrador" : " · Gerente");
    const data = await api("/api/gerente/dashboard");
    const team = data.equipe || [];
    const properties = data.imoveis || [];
    const leads = data.leads || [];
    const visits = [...(data.visitas || []), ...(data.agendamentos || [])];
    $("#manager-stat-team").textContent = team.length;
    $("#manager-stat-properties").textContent = properties.length;
    $("#manager-stat-leads").textContent = leads.length;
    $("#manager-stat-visits").textContent = visits.length;

    managerProperties = properties;
    managerTeam = team;
    managerLeads = leads;
    managerPerformance = data.desempenhoCorretores || [];
    renderManagerTeam();
    renderManagerPerformance();
    renderManagerLeads();
    renderManagerProperties();
    rows("#manager-visits", visits, "Nenhuma visita ou solicitação encontrada.", item =>
      '<tr><td>' + esc(item.clienteNome || item.cliente || "—") + '</td><td>' + esc(item.imovelId || "—") +
      '</td><td>' + date(item.inicio || item.data) + '</td><td>' + esc(item.responsavelNome) +
      '</td><td>' + esc(item.status || "—") + '</td></tr>', 5);
    $("#manager-feedback").textContent = "Dados da equipe atualizados.";
  } catch (error) {
    $("#manager-feedback").textContent = error.message;
  } finally {
    loading = false;
  }
}
$("#manager-broker-search")?.addEventListener("input", event => { brokerSearchTerm = event.target.value || ""; renderManagerTeam(); });
$("#manager-performance-search")?.addEventListener("input", event => { performanceSearchTerm = event.target.value || ""; renderManagerPerformance(); });
$("#manager-lead-search")?.addEventListener("input", event => { leadSearchTerm = event.target.value || ""; renderManagerLeads(); });
$("#manager-property-search")?.addEventListener("input", event => {
  managerSearchTerm = event.target.value || "";
  renderManagerProperties();
});
$("#manager-refresh").addEventListener("click", load);
$("#manager-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("/login.html");
});
onAuthStateChanged(auth, user => {
  if (!user) { window.location.replace("/login.html"); return; }
  currentUser = user;
  void load();
});