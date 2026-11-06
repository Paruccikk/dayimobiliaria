import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let loading = false;

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

    rows("#manager-team", team, "Nenhum corretor vinculado a este gerente.", user => {
      const ownProperties = properties.filter(item => item.responsavelUid === user.uid).length;
      const ownLeads = leads.filter(item => item.responsavelUid === user.uid).length;
      return '<tr><td><strong>' + esc(user.nome) + '</strong></td><td>' + esc(user.email || "—") +
        '</td><td>' + ownProperties + '</td><td>' + ownLeads + '</td></tr>';
    }, 4);
    const performance = data.desempenhoCorretores || [];
    rows("#manager-performance", performance, "Nenhum corretor vinculado.", item =>
      '<tr><td><strong>' + esc(item.nome) + '</strong></td><td>' + item.imoveis +
      '</td><td>' + item.leads + '</td><td>' + item.leadsNovos + '</td><td>' + item.propostas +
      '</td><td>' + item.fechados + '</td><td>' + item.visitas + '</td><td>' + item.visitasRealizadas + '</td></tr>', 8);
    rows("#manager-leads", leads.slice(0, 100), "Nenhum lead da equipe.", lead =>
      '<tr><td><strong>' + esc(lead.nome || "—") + '</strong><div class="dash-subtitle">' + esc(lead.mensagem || "") +
      '</div></td><td>' + esc(lead.telefone || "—") + '</td><td>' + esc(lead.responsavelNome) +
      '</td><td>' + esc(lead.status || "novo") + '</td><td>' + date(lead.criadoEm) + '</td></tr>', 5);
    rows("#manager-properties", properties, "Nenhum imóvel na carteira da equipe.", item =>
      '<tr><td><strong>' + esc(item.titulo || "Sem título") + '</strong><div class="dash-subtitle">' +
      esc(item.cidade || "") + '</div></td><td>' + esc(item.finalidade || "—") + '</td><td>' + money(item.preco) +
      '</td><td>' + esc(item.responsavelNome) + '</td><td>' + esc(item.status || "—") + '</td></tr>', 5);
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