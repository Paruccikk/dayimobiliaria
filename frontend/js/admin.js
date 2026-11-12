import { auth } from "./firebase-client.js";

import {
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
  if (text) {
    console.warn(text);
  }

  window.location.replace("/login.html");
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
    tbody.innerHTML = '<tr><td colspan="7">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  const roles = ["cliente", "corretor", "gerente", "administrador"];
  const managers = users.filter(user => user.papel === "gerente" && user.ativo === true && user.status === "ativo");

  tbody.innerHTML = users.map(user => {
    const roleOptions = roles.map(role => `
      <option value="${role}" ${user.papel === role ? "selected" : ""}>
        ${role}
      </option>
    `).join("");

    const isActive = user.ativo === true && user.status === "ativo";
    const managerOptions = `<option value="">Sem gerente</option>${managers.map(manager => `<option value="${escapeHtml(manager.uid)}" ${user.gerenteUid === manager.uid ? "selected" : ""}>${escapeHtml(manager.nome || manager.email || manager.uid)}</option>`).join("")}`;

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
        <td><select class="user-manager" aria-label="Gerente responsável" ${user.papel !== "corretor" ? "disabled" : ""}>${managerOptions}</select></td>
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
      const gerenteUid = papel === "corretor" ? row.querySelector(".user-manager").value : "";

      button.disabled = true;

      try {
        await api(`/api/admin/usuarios/${encodeURIComponent(uid)}`, {
          method: "PATCH",
          body: JSON.stringify({ papel, gerenteUid })
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

function renderProductivity(productivity = {}) {
  const managers = productivity.gerentes || [];
  const brokers = productivity.corretores || [];
  const num = (id, value) => { const el = $(id); if (el) el.textContent = Number(value || 0).toLocaleString("pt-BR"); };
  num("#prod-gerentes", managers.length);
  num("#prod-corretores", brokers.length);
  num("#prod-visitas", productivity.visitasRealizadas);
  num("#prod-propostas", productivity.propostas);
  num("#prod-fechados", productivity.fechados);
  const managerNames = Object.fromEntries(managers.map(item => [item.uid, item.nome]));
  const managerBody = $("#prod-gerentes-lista");
  managerBody.innerHTML = managers.length ? managers.map(item =>
    "<tr><td><strong>" + escapeHtml(item.nome) + "</strong></td><td>" + item.corretores +
    "</td><td>" + item.imoveis + "</td><td>" + item.leads + "</td><td>" + item.propostas +
    "</td><td>" + item.fechados + "</td><td>" + item.visitas + "</td><td>" + item.visitasRealizadas + "</td></tr>"
  ).join("") : '<tr><td colspan="8">Nenhum gerente cadastrado.</td></tr>';
  const brokerBody = $("#prod-corretores-lista");
  brokerBody.innerHTML = brokers.length ? brokers.map(item =>
    "<tr><td><strong>" + escapeHtml(item.nome) + "</strong><div class=\"dash-subtitle\">" + escapeHtml(item.email) +
    "</div></td><td>" + escapeHtml(managerNames[item.gerenteUid] || "Sem gerente") +
    "</td><td>" + item.imoveis + "</td><td>" + item.leads + "</td><td>" + item.leadsNovos +
    "</td><td>" + item.propostas + "</td><td>" + item.fechados + "</td><td>" + item.visitas +
    "</td><td>" + item.visitasRealizadas + "</td></tr>"
  ).join("") : '<tr><td colspan="9">Nenhum corretor cadastrado.</td></tr>';
}


function renderCareerApplications(items) {
  const tbody=$("#career-applications-list");
  if(!tbody)return;
  if(!items.length){tbody.innerHTML='<tr><td colspan="7">Nenhuma candidatura recebida ainda.</td></tr>';return;}
  const safeLink=(value)=>{try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)?u.href:"";}catch{return "";}};
  tbody.innerHTML=items.map(item=>{
    const links=[["Instagram / rede",item.instagram],["LinkedIn / portfólio",item.linkedin],["Outros links",item.links]]
      .map(([label,value])=>{const url=safeLink(value);return url?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>':(value?'<div>'+escapeHtml(value)+'</div>':"");}).join("<br>");
    return '<tr><td><strong>'+escapeHtml(item.nome)+'</strong><div class="dash-subtitle">'+escapeHtml(item.email)+'</div><div>'+escapeHtml(item.cidade||"")+'</div></td><td>'+escapeHtml(item.telefone)+'</td><td>'+ (links||"—") +'</td><td>'+escapeHtml(item.descricao||"—")+'</td><td>'+escapeHtml(item.mensagemContato||"—")+'</td><td>'+escapeHtml(item.motivo||"—")+'</td><td>'+formatDate(item.criadoEm)+'</td></tr>';
  }).join("");
}

async function carregarDashboard() {
  if (!currentUser || loading) return;
  loading = true;
  refreshButton.disabled = true;
  setMessage(dashboardFeedback, "Validando acesso administrativo…");

  try {
    const authData = await api("/api/auth/perfil");
    const profile = authData.perfil;
    if (!profile) throw new Error("Perfil não encontrado.");
    if (profile.papel === "cliente") {
      window.location.replace("/");
      return;
    }
    if (profile.papel === "corretor") {
      window.location.replace("/painel.html");
      return;
    }
    if (profile.papel !== "administrador" || profile.ativo !== true || profile.status !== "ativo") {
      throw new Error("Apenas administradores ativos podem acessar esta área.");
    }

    setMessage(dashboardFeedback, "Atualizando indicadores e dados…");
    const data = await api("/api/admin/dashboard");
    const careerData = await api("/api/admin/oportunidades-corretor");
    renderCareerApplications(Array.isArray(careerData.items) ? careerData.items : []);
    dashboardData = data;

    const summary = data.resumo || {};
    renderSummary(summary);
    renderProperties(Array.isArray(data.imoveis) ? data.imoveis : []);
    renderUsers(Array.isArray(data.usuarios) ? data.usuarios : []);
    renderLeads(Array.isArray(data.leads) ? data.leads : []);
    renderProductivity(data.produtividade || {});

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


$("#usuarios-lista").addEventListener("change", event => {
  if (event.target.matches(".user-role")) {
    const row = event.target.closest("tr");
    const manager = row.querySelector(".user-manager");
    manager.disabled = event.target.value !== "corretor";
    if (manager.disabled) manager.value = "";
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
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;

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
    situacaoObra: $("#prop-situacao").value,
    minhaCasaMinhaVida: $("#prop-mcmv").checked,
    banheiros: $("#prop-banheiros").value,
    vagas: $("#prop-vagas").value,
    descricao: $("#prop-descricao").value.trim(),
    publicadoNoSite: $("#prop-publicar").checked,
    publicarImediatamente: $("#prop-publicar").checked
  };

  try {
    let propertyId = propertyForm.dataset.pendingUploadId || "";
    let published = $("#prop-publicar").checked;

    if (!propertyId) {
      setMessage($("#property-feedback"), "Cadastrando imóvel…");

      const result = await api("/api/admin/imoveis", {
        method: "POST",
        body: JSON.stringify(body)
      });

      propertyId = result.id;
      propertyForm.dataset.pendingUploadId = propertyId;
      published = result.item?.status === "publicado";
    } else {
      setMessage($("#property-feedback"), "Tentando enviar os arquivos novamente…");
    }

    const selectedFiles = [
      ...Array.from($("#prop-fotos").files || []),
      ...Array.from($("#prop-documentos").files || [])
    ];

    if (selectedFiles.length) {
      setMessage($("#property-feedback"), `Enviando ${selectedFiles.length} arquivo(s) para o servidor…`);

      const formData = new FormData();
      selectedFiles.forEach(file => formData.append("arquivos", file));

      const token = await currentUser.getIdToken();
      const uploadResponse = await fetch(
        "/api/admin/imoveis/" + encodeURIComponent(propertyId) + "/arquivos",
        { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData }
      );
      const uploadData = await uploadResponse.json().catch(() => ({}));

      if (!uploadResponse.ok) {
        const detail = uploadData.error || `Falha no envio dos arquivos (HTTP ${uploadResponse.status}).`;
        throw new Error(`O imóvel ${published ? "foi publicado" : "foi cadastrado e aguarda aprovação"} com ID ${propertyId}, mas os arquivos não foram enviados: ${detail} Selecione novamente os arquivos e clique em “Tentar enviar arquivos”.`);
      }
    }

    delete propertyForm.dataset.pendingUploadId;
    propertyForm.reset();
    $("#prop-publicar").checked = true;
    submitButton.textContent = originalLabel;

    setMessage(
      $("#property-feedback"),
      `Imóvel ${published ? "cadastrado e publicado no site" : "cadastrado e enviado para aprovação"} com sucesso. ID: ${propertyId}`
    );

    await carregarDashboard();
  } catch (error) {
    if (propertyForm.dataset.pendingUploadId) {
      submitButton.textContent = "Tentar enviar arquivos";
    }
    setMessage($("#property-feedback"), error.message);
  } finally {
    submitButton.disabled = false;
  }
});


onAuthStateChanged(auth, user => {
  currentUser = user;

  if (refreshButton) refreshButton.disabled = !user;
  if (logoutButton) logoutButton.disabled = !user;

  if (!user) {
    window.location.replace("/login.html");
    return;
  }

  // Usa a sessão já autenticada no login.html.
  void carregarDashboard();
});

