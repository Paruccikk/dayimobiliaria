import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let currentProfile = null;
let loading = false;

// Utilitários
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const money = (val) => val == null || val === "" ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(val));
const formatDate = (val) => val ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(val)) : "—";

function statusLabel(status) {
  const labels = { 
    publicado: "Publicado", aguardando_aprovacao: "Pendente", inativo: "Inativo", novo: "Novo",
    pendente: "Pendente", confirmado: "Confirmado", recusado: "Recusado", concluido: "Concluído" 
  };
  return labels[status] || status || "—";
}
function statusPill(status) {
  let cls = "pill";
  if (["publicado", "confirmado", "concluido"].includes(status)) cls = "pill pill-green";
  else if (["aguardando_aprovacao", "pendente", "novo"].includes(status)) cls = "pill pill-gold";
  return `<span class="${cls}">${escapeHtml(statusLabel(status))}</span>`;
}

// API Helper
async function api(url, options = {}) {
  if (!currentUser) throw new Error("Sessão expirada.");
  const token = await currentUser.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição.");
  return data;
}

// Ação de atualizar Agendamento
window.updateAgenda = async function(id, status, btn) {
  btn.disabled = true;
  try {
    await api(`/api/agendamentos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadDashboard();
  } catch (e) {
    alert("Erro ao atualizar agendamento: " + e.message);
    btn.disabled = false;
  }
};

// Carregar Dados
async function loadDashboard() {
  if (loading) return;
  loading = true;
  $("#dash-feedback").textContent = "Atualizando carteira…";

  try {
    const profileData = await api("/api/auth/perfil");
    currentProfile = profileData.perfil;
    
    if (!["corretor", "administrador"].includes(currentProfile?.papel)) {
      throw new Error("Acesso restrito a corretores.");
    }

    $("#corretor-welcome").textContent = `Conectado como ${currentUser.email} · ${currentProfile.papel}`;

    const data = await api("/api/admin/dashboard");
    
    const allImoveis = data.imoveis || [];
    const myImoveis = currentProfile.papel === "administrador" 
      ? allImoveis 
      : allImoveis.filter(i => i.responsavelUid === currentUser.uid);

    $("#stat-total").textContent = myImoveis.length;
    $("#stat-publicados").textContent = myImoveis.filter(i => i.status === "publicado").length;
    $("#stat-pendentes").textContent = myImoveis.filter(i => i.status === "aguardando_aprovacao").length;
    
    const leads = data.leads || [];
    $("#stat-leads").textContent = leads.length;

    // --- RENDERIZAR TABELA DE IMÓVEIS ---
    const tbodyImoveis = $("#imoveis-lista");
    if (myImoveis.length === 0) {
      tbodyImoveis.innerHTML = '<tr><td colspan="5">Você ainda não tem imóveis cadastrados.</td></tr>';
    } else {
      tbodyImoveis.innerHTML = myImoveis.map(item => `
        <tr>
          <td>
            <strong>${escapeHtml(item.titulo)}</strong>
            <div class="dash-subtitle">${escapeHtml(item.bairro || "")} ${item.cidade ? `- ${escapeHtml(item.cidade)}` : ""}</div>
          </td>
          <td>${escapeHtml(item.finalidade)}</td>
          <td>${money(item.preco)}</td>
          <td>${statusPill(item.status)}</td>
          <td>
            <a href="/detalhes.html?id=${encodeURIComponent(item.id)}" class="small-btn light" target="_blank">Ver no site ↗</a>
          </td>
        </tr>
      `).join("");
    }

    // --- RENDERIZAR AGENDAMENTOS ---
    const resAgenda = await api("/api/agendamentos");
    const agendamentos = resAgenda.items || [];
    const tbodyAgenda = $("#agenda-lista");
    
    if (agendamentos.length === 0) {
      tbodyAgenda.innerHTML = '<tr><td colspan="6">Nenhuma visita agendada no momento.</td></tr>';
    } else {
      tbodyAgenda.innerHTML = agendamentos.map(ag => {
        // Formata a data AAAA-MM-DD para DD/MM/AAAA
        const dataF = ag.data.split('-').reverse().join('/');
        return `
        <tr>
          <td>
            <strong>${escapeHtml(ag.clienteNome)}</strong>
            <div class="dash-subtitle">${escapeHtml(ag.clienteTelefone)}</div>
          </td>
          <td>${escapeHtml(ag.imovelId.slice(0, 8))}...</td>
          <td>${dataF} · ${escapeHtml(ag.turno)}</td>
          <td>${escapeHtml(ag.tipo)}</td>
          <td>${statusPill(ag.status)}</td>
          <td>
            ${ag.status === 'pendente' ? `
              <button class="small-btn gold" onclick="updateAgenda('${ag.id}', 'confirmado', this)">Confirmar</button>
              <button class="small-btn light" onclick="updateAgenda('${ag.id}', 'recusado', this)">Recusar</button>
            ` : '<span class="dash-subtitle">Finalizado</span>'}
          </td>
        </tr>
      `}).join("");
    }

    // --- RENDERIZAR TABELA DE LEADS ---
    const tbodyLeads = $("#leads-lista");
    if (leads.length === 0) {
      tbodyLeads.innerHTML = '<tr><td colspan="4">Nenhum lead recebido ainda.</td></tr>';
    } else {
      tbodyLeads.innerHTML = leads.slice(0, 10).map(lead => `
        <tr>
          <td>
            <strong>${escapeHtml(lead.nome)}</strong>
            <div class="dash-subtitle">${escapeHtml(lead.mensagem || "")}</div>
          </td>
          <td>
            <a href="https://wa.me/55${lead.telefone.replace(/\D/g, '')}" target="_blank" style="color:var(--gold-2);">
              ${escapeHtml(lead.telefone)} ↗
            </a>
          </td>
          <td>${escapeHtml(lead.imovelId || "—")}</td>
          <td>${formatDate(lead.criadoEm)}</td>
        </tr>
      `).join("");
    }

    $("#dash-feedback").textContent = "Carteira atualizada com sucesso.";
    $("#dash-feedback").style.color = "var(--text-soft)";

  } catch (err) {
    $("#dash-feedback").textContent = err.message;
    $("#dash-feedback").style.color = "#f06ca8";
  } finally {
    loading = false;
  }
}

// Cadastro de Imóvel
$("#property-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#btn-submit");
  const feedback = $("#form-feedback");
  
  btn.disabled = true;
  btn.textContent = "Enviando…";
  feedback.textContent = "";

  const body = {
    titulo: $("#prop-titulo").value,
    categoria: $("#prop-categoria").value,
    finalidade: $("#prop-finalidade").value,
    preco: $("#prop-preco").value,
    cidade: $("#prop-cidade").value,
    estado: $("#prop-estado").value,
    bairro: $("#prop-bairro").value,
    areaM2: $("#prop-area").value,
    quartos: $("#prop-quartos").value,
    suites: $("#prop-suites").value,
    banheiros: $("#prop-banheiros").value,
    vagas: $("#prop-vagas").value,
    descricao: $("#prop-descricao").value,
    publicadoNoSite: false
  };

  try {
    await api("/api/admin/imoveis", { method: "POST", body: JSON.stringify(body) });
    feedback.textContent = "Imóvel enviado para aprovação do administrador!";
    feedback.style.color = "var(--gold-2)";
    e.target.reset();
    await loadDashboard();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = "#f06ca8";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar para Aprovação";
  }
});

// Controles de UI
$("#btn-refresh").addEventListener("click", loadDashboard);
$("#btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("/login.html");
});

// Inicialização
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }
  currentUser = user;
  loadDashboard();
});