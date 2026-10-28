import { auth } from "./firebase-client.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);

const loginScreen = $("#login-screen");
const adminApp = $("#admin-app");
const feedback = $("#admin-feedback");
const dashboardFeedback = $("#dashboard-feedback");
const loginForm = $("#admin-login-form");
const loginButton = $("#admin-login");
const refreshButton = $("#admin-refresh");
const logoutButton = $("#admin-logout");
const propertyForm = $("#admin-property-form");

let currentUser = null;
let dashboardData = null;
let loading = false;

function setMessage(element, text) {
  element.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  }).format(number);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function statusLabel(status) {
  const labels = {
    publicado: "Publicado",
    aguardando_aprovacao: "Pendente",
    rascunho: "Rascunho",
    reservado: "Reservado",
    vendido: "Vendido",
    alugado: "Alugado",
    inativo: "Inativo",
    novo: "Novo",
    em_atendimento: "Em atendimento",
    concluido: "Concluído"
  };
  return labels[status] || status || "—";
}

function statusPill(status) {
  const cls = status === "publicado" || status === "ativo"
    ? "pill pill-green"
    : status === "aguardando_aprovacao" || status === "pendente" || status === "novo"
      ? "pill pill-gold"
      : "pill";
  return `<span class="${cls}">${escapeHtml(statusLabel(status))}</span>`;
}

async function api(url, options = {}) {
  if (!currentUser) throw new Error("Faça login primeiro.");

  const token = await currentUser.getIdToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data;
}

function showLogin(text = "") {
  loginScreen.hidden = false;
  adminApp.hidden = true;
  if (text) setMessage(feedback, text);
}

function showAdmin() {
  loginScreen.hidden = true;
  adminApp.hidden = false;
}

function setNumber(id, value) {
  $(id).textContent = Number(value || 0).toLocaleString("pt-BR");
}

function setBar(id, numberId, value, max) {
  const safeValue = Number(value || 0);
  const safeMax = Math.max(1, Number(max || 0));
  $(id).style.width = `${Math.min(100, (safeValue / safeMax) * 100)}%`;
  $(numberId).textContent = safeValue.toLocaleString("pt-BR");
}

function renderSummary(summary) {
  setNumber("#stat-imoveis", summary.totalImoveis);
  setNumber("#stat-publicados", summary.publicados);
  setNumber("#stat-pendentes", summary.pendentes);
  setNumber("#stat-clientes", summary.clientes);
  setNumber("#stat-venda", summary.venda);
  setNumber("#stat-locacao", summary.locacao);
  setNumber("#stat-corretores", summary.corretores);
  setNumber("#stat-leads", summary.leads);
  setNumber("#stat-leads-novos", summary.leadsNovos);

  const propertyMax = Math.max(
    1,
    summary.totalImoveis || 0,
    summary.venda || 0,
    summary.locacao || 0,
    summary.temporada || 0
  );

  setBar("#bar-venda", "#bar-venda-num", summary.venda, propertyMax);
  setBar("#bar-locacao", "#bar-locacao-num", summary.locacao, propertyMax);
  setBar("#bar-temporada", "#bar-temporada-num", summary.temporada, propertyMax);
  setBar("#bar-publicados", "#bar-publicados-num", summary.publicados, propertyMax);
  setBar("#bar-pendentes", "#bar-pendentes-num", summary.pendentes, propertyMax);
  setBar("#bar-inativos", "#bar-inativos-num", summary.inativos, propertyMax);
}

function renderProperties(properties) {
  const tbody = $("#imoveis-lista");

  if (!properties.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum imóvel cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = properties.map(property => {
    const status = property.status || "rascunho";
    const actionLabel = status === "publicado" ? "Desativar" : "Publicar";
    const nextStatus = status === "publicado" ? "inativo" : "publicado";
    const responsible = property.responsavelNome || property.responsavelEmail ||
      (property.responsavelUid ? `UID ${property.responsavelUid}` : "—");

    return `
      <tr data-property-id="${escapeHtml(property.id)}">
        <td>
          <strong>${escapeHtml(property.titulo || "Sem título")}</strong>
          <div class="dash-subtitle">${escapeHtml(property.cidade || "")}${property.estado ? `/${escapeHtml(property.estado)}` : ""}</div>
        </td>
        <td>${escapeHtml(property.finalidade || "—")}</td>
        <td>${escapeHtml(money(property.preco))}</td>
        <td>${escapeHtml(responsible)}</td>
        <td>${statusPill(status)}</td>
        <td>
          <button type="button" class="small-btn gold property-status"
            data-status="${nextStatus}">
            ${actionLabel}
          </button>
          <a class="small-btn light" href="/detalhes.html?id=${encodeURIComponent(property.id)}">Ver</a>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".property-status").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const id = row.dataset.propertyId;
      const status = button.dataset.status;

      button.disabled = true;

      try {
        await api(`/api/admin/imoveis/${encodeURIComponent(id)}/aprovacao`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        setMessage(
          dashboardFeedback,
          status === "publicado" ? "Imóvel publicado no site." : "Imóvel desativado."
        );
        await carregarDashboard();
      } catch (error) {
        setMessage(dashboardFeedback, error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderUsers(users) {
  const tbody = $("#usuarios-lista");

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  const roles = ["cliente", "corretor", "administrador"];

  tbody.innerHTML = users.map(user => {
    const roleOptions = roles.map(role => `
      <option value="${role}" ${user.papel === role ? "selected" : ""}>
        ${role}
      </option>
    `).join("");

    const isActive = user.ativo === true && user.status === "ativo";

    const pedido = user.solicitacaoPapel === "corretor"
      ? "Solicitou corretor"
      : "Cliente";

    return `
      <tr data-user-uid="${escapeHtml(user.uid)}">
        <td>
          <strong>${escapeHtml(user.nome || "Sem nome")}</strong>
          <div class="dash-subtitle">${escapeHtml(user.email || "")}</div>
        </td>
        <td>${escapeHtml(user.telefone || "—")}</td>
        <td>${escapeHtml(pedido)}</td>
        <td><select class="user-role" aria-label="Perfil do usuário">${roleOptions}</select></td>
        <td>${statusPill(isActive ? "ativo" : (user.status || "inativo"))}</td>
        <td>
          <button type="button" class="small-btn save-role">Salvar perfil</button>
          <button type="button" class="small-btn light toggle-user"
            data-active="${isActive ? "false" : "true"}">
            ${isActive ? "Desativar" : "Ativar"}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".save-role").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const uid = row.dataset.userUid;
      const papel = row.querySelector(".user-role").value;

      button.disabled = true;

      try {
        await api(`/api/admin/usuarios/${encodeURIComponent(uid)}`, {
          method: "PATCH",
          body: JSON.stringify({ papel })
        });
        setMessage(dashboardFeedback, "Perfil atualizado.");
        await carregarDashboard();
      } catch (error) {
        setMessage(dashboardFeedback, error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

  tbody.querySelectorAll(".toggle-user").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const uid = row.dataset.userUid;
      const ativo = button.dataset.active === "true";

      button.disabled = true;

      try {
        await api(`/api/admin/usuarios/${encodeURIComponent(uid)}`, {
          method: "PATCH",
          body: JSON.stringify({ ativo })
        });
        setMessage(
          dashboardFeedback,
          ativo ? "Usuário ativado." : "Usuário desativado."
        );
        await carregarDashboard();
      } catch (error) {
        setMessage(dashboardFeedback, error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderLeads(leads) {
  const tbody = $("#leads-lista");

  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum lead recebido.</td></tr>';
    return;
  }

  tbody.innerHTML = leads.map(lead => `
    <tr>
      <td>${escapeHtml(lead.nome || "—")}<div class="dash-subtitle">${escapeHtml(lead.mensagem || "")}</div></td>
      <td>${escapeHtml(lead.telefone || "—")}</td>
      <td>${escapeHtml(lead.imovelId || "—")}</td>
      <td>${statusPill(lead.status || "novo")}</td>
      <td>${escapeHtml(formatDate(lead.criadoEm))}</td>
    </tr>
  `).join("");
}

async function carregarDashboard() {
  if (!currentUser || loading) return;
  loading = true;
  refreshButton.disabled = true;
  setMessage(dashboardFeedback, "Atualizando indicadores e dados…");

  try {
    const data = await api("/api/admin/dashboard");
    dashboardData = data;

    const summary = data.resumo || {};
    renderSummary(summary);
    renderProperties(Array.isArray(data.imoveis) ? data.imoveis : []);
    renderUsers(Array.isArray(data.usuarios) ? data.usuarios : []);
    renderLeads(Array.isArray(data.leads) ? data.leads : []);

    showAdmin();
    $("#admin-welcome").textContent =
      `Conectado como ${currentUser.email || currentUser.uid} · Administrador`;
    setMessage(dashboardFeedback, "Dados atualizados com sucesso.");
  } catch (error) {
    setMessage(dashboardFeedback, error.message);

    if (/permissão|autorização|perfil|inativo|pendente/i.test(error.message)) {
      showLogin(error.message);
    }
  } finally {
    loading = false;
    refreshButton.disabled = !currentUser;
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("#admin-email").value.trim();
  const password = $("#admin-password").value;

  if (!email || !password) {
    setMessage(feedback, "Informe e-mail e senha.");
    return;
  }

  loginButton.disabled = true;
  setMessage(feedback, "Autenticando…");

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    currentUser = credential.user;
    setMessage(feedback, "Login realizado. Validando perfil administrativo…");
    await carregarDashboard();
  } catch (error) {
    const message = error.code === "auth/invalid-credential"
      ? "E-mail ou senha incorretos."
      : error.message || "Não foi possível entrar.";
    setMessage(feedback, message);
  } finally {
    loginButton.disabled = false;
  }
});

refreshButton.addEventListener("click", carregarDashboard);

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    currentUser = null;
    dashboardData = null;
    showLogin("Você saiu da administração.");
  } catch (error) {
    setMessage(dashboardFeedback, error.message);
  }
});

propertyForm.addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = $("#prop-submit");
  submitButton.disabled = true;
  setMessage($("#property-feedback"), "Cadastrando imóvel…");

  const body = {
    titulo: $("#prop-titulo").value.trim(),
    categoria: $("#prop-categoria").value,
    finalidade: $("#prop-finalidade").value,
    preco: $("#prop-preco").value,
    cidade: $("#prop-cidade").value.trim(),
    estado: $("#prop-estado").value.trim().toUpperCase(),
    bairro: $("#prop-bairro").value.trim(),
    areaM2: $("#prop-area").value,
    quartos: $("#prop-quartos").value,
    suites: $("#prop-suites").value,
    banheiros: $("#prop-banheiros").value,
    vagas: $("#prop-vagas").value,
    descricao: $("#prop-descricao").value.trim(),
    publicadoNoSite: $("#prop-publicar").checked
  };

  try {
    const result = await api("/api/admin/imoveis", {
      method: "POST",
      body: JSON.stringify(body)
    });

    propertyForm.reset();
    $("#prop-publicar").checked = true;

    setMessage(
      $("#property-feedback"),
      body.publicadoNoSite
        ? `Imóvel cadastrado e publicado. ID: ${result.id}`
        : `Imóvel cadastrado e enviado para aprovação. ID: ${result.id}`
    );

    await carregarDashboard();
  } catch (error) {
    setMessage($("#property-feedback"), error.message);
  } finally {
    submitButton.disabled = false;
  }
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  refreshButton.disabled = !user;
  logoutButton.disabled = !user;

  if (!user) {
    showLogin();
    return;
  }

  // O endpoint administrativo valida papel, ativo e status no servidor.
  carregarDashboard();
});
