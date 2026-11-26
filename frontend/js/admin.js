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
let propertySearchTerm = "";
let brokerSearchTerm = "";
let leadSearchTerm = "";

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

function renderPropertyFiles(property) {
  const panel = $("#editing-property-files");
  const container = $("#editing-property-files-list");
  if (!panel || !container) return;

  if (!property) {
    panel.hidden = true;
    container.innerHTML = "";
    return;
  }

  const photos = Array.isArray(property.fotos) ? property.fotos : [];
  const documents = Array.isArray(property.documentos) ? property.documentos : [];
  const metadata = Array.isArray(property.arquivos) ? property.arquivos : [];
  const metadataByUrl = new Map(metadata.map(file => [file.url, file]));
  const photoCards = photos.map(url => {
    const info = metadataByUrl.get(url) || {};
    const filename = info.nome || decodeURIComponent(String(url).split("/").pop() || "imagem");
    return `
      <article class="property-file-card">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(filename)}" loading="lazy">
          <span class="property-file-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>
          <small>Imagem</small>
        </a>
        <button type="button" class="small-btn property-file-delete" data-file-url="${escapeHtml(url)}">Excluir imagem</button>
      </article>`;
  }).join("");
  const pdfCards = documents.map(file => {
    const filename = file.nome || decodeURIComponent(String(file.url || "").split("/").pop() || "documento.pdf");
    return `
      <article class="property-file-card property-pdf-card">
        <a href="${escapeHtml(file.url || "#")}" target="_blank" rel="noopener noreferrer">
          <span class="property-pdf-icon" aria-hidden="true">PDF</span>
          <span class="property-file-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>
          <small>Documento PDF</small>
        </a>
        <button type="button" class="small-btn property-file-delete" data-file-url="${escapeHtml(file.url || "")}">Excluir PDF</button>
      </article>`;
  }).join("");

  panel.hidden = false;
  container.innerHTML = photos.length || documents.length
    ? `<p class="dash-subtitle">${photos.length} imagem(ns) · ${documents.length} PDF(s)</p><div class="property-files-grid">${photoCards}${pdfCards}</div>`
    : '<p class="dash-subtitle">Este imóvel ainda não possui imagens ou PDFs cadastrados.</p>';

  container.querySelectorAll(".property-file-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const url = button.dataset.fileUrl;
      if (!url) return;
      const isPdf = button.textContent.includes("PDF");
      const file = isPdf
        ? documents.find(item => item.url === url)
        : null;
      const name = file?.nome || decodeURIComponent(String(url).split("/").pop() || "arquivo");
      if (!window.confirm(`Deseja excluir definitivamente "${name}" deste imóvel?`)) return;

      button.disabled = true;
      try {
        await api("/api/admin/imoveis/" + encodeURIComponent(property.id) + "/arquivos", {
          method: "DELETE",
          body: JSON.stringify({ url })
        });
        await carregarDashboard();
        const refreshed = (dashboardData?.imoveis || []).find(item => item.id === property.id);
        renderPropertyFiles(refreshed || null);
        setMessage($("#property-feedback"), "Arquivo excluído com sucesso.");
      } catch (error) {
        setMessage($("#property-feedback"), error.message);
        button.disabled = false;
      }
    });
  });
}

function renderProperties(properties) {
  const tbody = $("#imoveis-lista");
  const normalize = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = normalize(propertySearchTerm.trim());
  const filteredProperties = query ? properties.filter(property => normalize([property.titulo, property.id, property.cidade, property.estado, property.bairro, property.regiao, property.finalidade, property.status, property.responsavelNome, property.responsavelEmail, property.responsavelUid].join(" ")).includes(query)) : properties;

  if (!properties.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum imóvel cadastrado.</td></tr>';
    return;
  }

  if (!filteredProperties.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum imóvel encontrado para essa busca.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredProperties.map(property => {
    const status = property.status || "rascunho";
    const actionLabel = status === "publicado" ? "Desativar" : "Publicar";
    const nextStatus = status === "publicado" ? "inativo" : "publicado";
    const responsible = property.responsavelNome || property.responsavelEmail ||
      (property.responsavelTipo === "todos" ? "Todos os corretores" : (property.responsavelUid ? `UID ${property.responsavelUid}` : "Sem responsável"));
    const activeBrokers = (dashboardData?.usuarios || []).filter(user => user.papel === "corretor" && user.ativo === true && user.status === "ativo");
    const assignmentOptions = `<option value="todos" ${property.responsavelTipo === "todos" ? "selected" : ""}>Todos os corretores</option><option value="" ${!property.responsavelUid && property.responsavelTipo !== "todos" ? "selected" : ""}>Sem responsável</option>` + activeBrokers.map(user => `<option value="${escapeHtml(user.uid)}" ${property.responsavelTipo !== "todos" && property.responsavelUid === user.uid ? "selected" : ""}>${escapeHtml(user.nome || user.email || user.uid)}</option>`).join("");

    return `
      <tr data-property-id="${escapeHtml(property.id)}">
        <td>
          <strong>${escapeHtml(property.titulo || "Sem título")}</strong>
          <div class="dash-subtitle">${escapeHtml(property.cidade || "")}${property.estado ? `/${escapeHtml(property.estado)}` : ""}${property.regiao ? ` · ${escapeHtml(property.regiao)}` : ""}</div>
        </td>
        <td>${escapeHtml(property.finalidade || "—")}</td>
        <td>${escapeHtml(money(property.preco))}</td>
        <td>${escapeHtml(responsible)}</td>
        <td>${statusPill(status)}</td>
        <td>
          <select class="property-assignee" aria-label="Corretor responsável" style="max-width:180px">${assignmentOptions}</select>
          <button type="button" class="small-btn save-assignee">Salvar responsável</button>
          <button type="button" class="small-btn property-edit">Editar</button>
          <button type="button" class="small-btn gold property-status"
            data-status="${nextStatus}">
            ${actionLabel}
          </button>
          <a class="small-btn light" href="/detalhes.html?id=${encodeURIComponent(property.id)}">Ver</a>
          <button type="button" class="small-btn property-delete" style="background:#7f1d1d;color:#fff;border-color:#991b1b">Excluir</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".save-assignee").forEach(button => {
    button.addEventListener("click", async () => {
      const row=button.closest("tr"), id=row.dataset.propertyId, value=row.querySelector(".property-assignee").value;
      button.disabled=true;
      try {
        const body=value==="todos"?{responsavelTipo:"todos"}:{responsavelTipo:"individual",responsavelUid:value||null};
        await api("/api/admin/imoveis/"+encodeURIComponent(id)+"/gestao",{method:"PATCH",body:JSON.stringify(body)});
        setMessage(dashboardFeedback,value==="todos"?"Imóvel disponível para todos os corretores.":"Responsável do imóvel atualizado.");
        await carregarDashboard();
      } catch(error){setMessage(dashboardFeedback,error.message);}
      finally{button.disabled=false;}
    });
  });
  tbody.querySelectorAll(".property-edit").forEach(button => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const property = properties.find(item => item.id === row.dataset.propertyId);
      if (!property) return;
      const fields = {
        "#prop-titulo": property.titulo, "#prop-categoria": property.categoria,
        "#prop-finalidade": property.finalidade, "#prop-preco": property.preco ?? "",
        "#prop-cidade": property.cidade, "#prop-estado": property.estado,
        "#prop-bairro": property.bairro, "#prop-regiao": (property.regiao || "").replace(/^Zona\s+/i, ""), "#prop-area": property.areaM2,
        "#prop-quartos": property.quartos, "#prop-suites": property.suites,
        "#prop-situacao": property.situacaoObra || "pronto",
        "#prop-banheiros": property.banheiros, "#prop-vagas": property.vagas,
        "#prop-descricao": property.descricao
      };
      Object.entries(fields).forEach(([selector, value]) => {
        const field = $(selector);
        if (field) field.value = value ?? "";
      });
      $("#prop-mcmv").checked = [true, "true", "sim", 1, "1"].includes(property.minhaCasaMinhaVida);
      propertyForm.dataset.editingPropertyId = property.id;
      delete propertyForm.dataset.pendingUploadId;
      $("#prop-publicar").checked = property.publicadoNoSite === true || property.status === "publicado";
      $("#prop-submit").textContent = "Salvar alterações";
      renderPropertyFiles(property);
      $("#property-feedback").textContent = "Editando: " + (property.titulo || property.id);
      propertyForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  tbody.querySelectorAll(".property-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const id = row.dataset.propertyId;
      const property = properties.find(item => item.id === id);
      const title = property?.titulo || id;
      if (!window.confirm(`Tem certeza que deseja excluir o anúncio "${title}"? Esta ação também remove as fotos e PDFs associados e não pode ser desfeita.`)) return;
      button.disabled = true;
      try {
        await api("/api/admin/imoveis/" + encodeURIComponent(id), { method: "DELETE" });
        setMessage(dashboardFeedback, "Anúncio removido com sucesso.");
        await carregarDashboard();
      } catch (error) {
        setMessage(dashboardFeedback, error.message);
        button.disabled = false;
      }
    });
  });

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
  const consentCounts = users.reduce((counts, user) => {
    const status = ["permitido", "negado"].includes(user.whatsappConsentStatus) ? user.whatsappConsentStatus : "pendente";
    counts[status]++;
    return counts;
  }, { permitido: 0, negado: 0, pendente: 0 });
  setNumber("#stat-wa-permitidos", consentCounts.permitido);
  setNumber("#stat-wa-negados", consentCounts.negado);
  setNumber("#stat-wa-pendentes", consentCounts.pendente);

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum usuário cadastrado.</td></tr>';
    setNumber("#stat-wa-permitidos", 0);
    setNumber("#stat-wa-negados", 0);
    setNumber("#stat-wa-pendentes", 0);
    return;
  }

  const normalize = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = normalize(brokerSearchTerm.trim());
  const filteredUsers = query ? users.filter(user => normalize([user.nome, user.email, user.telefone, user.uid, user.papel, user.gerenteNome, user.gerenteEmail, user.gerenteUid].join(" ")).includes(query)) : users;

  const roles = ["cliente", "corretor", "gerente", "administrador"];
  const managers = users.filter(user => user.papel === "gerente" && user.ativo === true && user.status === "ativo");

  if (!filteredUsers.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum corretor ou usuário encontrado para essa busca.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredUsers.map(user => {
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
    const waStatus = ["permitido", "negado"].includes(user.whatsappConsentStatus) ? user.whatsappConsentStatus : "pendente";
    const waLabel = waStatus === "permitido" ? "Permitido" : waStatus === "negado" ? "Negado" : "Pendente";
    const waClass = waStatus === "permitido" ? "pill pill-green" : waStatus === "negado" ? "pill" : "pill pill-gold";

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
        <td><span class="${waClass}">${waLabel}</span>${user.whatsappConsentEm ? `<div class="dash-subtitle">${escapeHtml(formatDate(user.whatsappConsentEm))}</div>` : ""}<div><button type="button" class="small-btn toggle-wa" data-active="${user.whatsappAtivo === false ? "false" : "true"}" ${waStatus !== "permitido" ? "disabled" : ""}>${user.whatsappAtivo === false ? "Ativar envios" : "Desativar envios"}</button></div></td>
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

  tbody.querySelectorAll(".toggle-wa").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const uid = row.dataset.userUid;
      const whatsappAtivo = button.dataset.active !== "true";
      button.disabled = true;
      try {
        await api(`/api/admin/usuarios/${encodeURIComponent(uid)}`, {
          method: "PATCH",
          body: JSON.stringify({ whatsappAtivo })
        });
        setMessage(dashboardFeedback, whatsappAtivo ? "Envios WhatsApp ativados." : "Envios WhatsApp desativados.");
        await carregarDashboard();
      } catch (error) {
        setMessage(dashboardFeedback, error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

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
  const normalize = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = normalize(leadSearchTerm.trim());
  const filteredLeads = query ? leads.filter(lead => normalize([lead.nome, lead.telefone, lead.email, lead.imovelId, lead.mensagem, lead.preferencias, lead.status, lead.responsavelNome].join(" ")).includes(query)) : leads;

  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum lead recebido.</td></tr>';
    return;
  }

  if (!filteredLeads.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum lead encontrado para essa busca.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredLeads.map(lead => `
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
  const visitsBody=$("#admin-visits-list");
  if(visitsBody){const visits=productivity.visitasRegistros||[];visitsBody.innerHTML=visits.length?visits.map(item=>"<tr><td>"+escapeHtml(item.clienteNome||item.cliente||"—")+"</td><td>"+escapeHtml(item.imovelId||"—")+"</td><td>"+escapeHtml(formatDate(item.inicio||item.data||item.criadoEm))+"</td><td>"+escapeHtml(item.corretorNome||"—")+"</td><td>"+escapeHtml(item.status||"—")+"</td></tr>").join(""):'<tr><td colspan="5">Nenhuma visita registrada.</td></tr>';}
  const proposalsBody=$("#admin-proposals-list");
  if(proposalsBody){const proposals=productivity.propostasRegistros||[];proposalsBody.innerHTML=proposals.length?proposals.map(item=>"<tr><td>"+escapeHtml(item.nome||"—")+"</td><td>"+escapeHtml(item.telefone||"—")+"</td><td>"+escapeHtml(item.imovelId||"—")+"</td><td>"+escapeHtml(item.responsavelNome||"—")+"</td><td>"+escapeHtml(formatDate(item.atualizadoEm||item.criadoEm))+"</td></tr>").join(""):'<tr><td colspan="5">Nenhuma proposta enviada registrada.</td></tr>';}
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

$("#admin-broker-search")?.addEventListener("input", event => {
  brokerSearchTerm = event.target.value || "";
  renderUsers(dashboardData?.usuarios || []);
});
$("#admin-lead-search")?.addEventListener("input", event => {
  leadSearchTerm = event.target.value || "";
  renderLeads(dashboardData?.leads || []);
});

$("#admin-property-search")?.addEventListener("input", event => {
  propertySearchTerm = event.target.value || "";
  renderProperties(dashboardData?.imoveis || []);
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
    regiao: $("#prop-regiao").value,
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
    const imageFiles = Array.from($("#prop-fotos").files || []);
    const pdfFiles = Array.from($("#prop-documentos").files || []);
    // Junta imagens e PDFs para usar o mesmo fluxo de envio individual.
    const selectedFiles = [...imageFiles, ...pdfFiles];
    const maxImageBytes = 50 * 1024 * 1024;
    const maxPdfBytes = 100 * 1024 * 1024;

    if (imageFiles.length > 40 || pdfFiles.length > 40) {
      throw new Error("O limite é de 40 imagens e 40 PDFs por imóvel.");
    }
    if (imageFiles.some(file => file.size > maxImageBytes)) {
      throw new Error("Cada imagem pode ter no máximo 50 MB.");
    }
    if (pdfFiles.some(file => file.size > maxPdfBytes)) {
      throw new Error("Cada PDF pode ter no máximo 100 MB.");
    }

    let propertyId = propertyForm.dataset.pendingUploadId || "";
    const editingId = propertyForm.dataset.editingPropertyId || "";
    const currentProperty = (dashboardData?.imoveis || []).find(item => item.id === editingId);
    const existingImages = currentProperty?.fotos?.length || 0;
    const existingPdfs = currentProperty?.documentos?.length || 0;
    if (existingImages + imageFiles.length > 40 || existingPdfs + pdfFiles.length > 40) {
      throw new Error(`Este imóvel já possui ${existingImages} imagem(ns) e ${existingPdfs} PDF(s). O limite é de 40 de cada tipo.`);
    }
    let published = $("#prop-publicar").checked;

    if (editingId) {
      setMessage($("#property-feedback"), "Salvando alterações do imóvel…");
      await api("/api/admin/imoveis/" + encodeURIComponent(editingId), {
        method: "PATCH", body: JSON.stringify(body)
      });
      propertyId = editingId;
    } else if (!propertyId) {
      setMessage($("#property-feedback"), "Cadastrando imóvel…");
      const result = await api("/api/admin/imoveis", {
        method: "POST", body: JSON.stringify(body)
      });
      propertyId = result.id;
      propertyForm.dataset.pendingUploadId = propertyId;
      published = result.item?.status === "publicado";
    } else {
      setMessage($("#property-feedback"), "Tentando enviar os arquivos novamente…");
    }

    if (selectedFiles.length) {
      setMessage($("#property-feedback"), `Enviando ${selectedFiles.length} arquivo(s) para o servidor…`);

      const token = await currentUser.getIdToken();
      // O usuário seleciona vários arquivos de uma vez; cada arquivo é transmitido
      // em uma requisição pequena para evitar limites de proxy/multipart no VPS.
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index];
        setMessage($("#property-feedback"), `Enviando arquivo ${index + 1} de ${selectedFiles.length}: ${file.name}`);
        const formData = new FormData();
        formData.append("arquivos", file);
        const uploadResponse = await fetch(
          "/api/admin/imoveis/" + encodeURIComponent(propertyId) + "/arquivos",
          { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData }
        );
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          const detail = uploadData.error || `Falha no envio de "${file.name}" (HTTP ${uploadResponse.status}).`;
          throw new Error(`O imóvel foi salvo com ID ${propertyId}, mas o arquivo "${file.name}" não foi enviado: ${detail} Selecione novamente apenas os arquivos que faltaram e tente novamente.`);
        }
      }
    }

    delete propertyForm.dataset.pendingUploadId;
    delete propertyForm.dataset.editingPropertyId;
    propertyForm.reset();
    renderPropertyFiles(null);
    $("#prop-publicar").checked = true;
    submitButton.textContent = originalLabel;

    setMessage(
      $("#property-feedback"),
      editingId ? `Alterações salvas com sucesso. ID: ${propertyId}` :
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

