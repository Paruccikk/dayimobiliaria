import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const hubGrid = $("#hub-grid");
const userEmail = $("#user-email");

const icons = {
  cliente: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  corretor: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>',
  admin: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M13 8h5M13 12h5M13 16h5"/></svg>'
};

async function api(user, url, options = {}) {
  if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
  const token = await user.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Falha ao consultar o servidor (${response.status}).`);
  return data;
}

function buildCard(title, description, href, icon, color) {
  const card = document.createElement("a");
  card.className = "hub-card";
  card.href = href;
  const iconBox = document.createElement("div");
  iconBox.className = "hub-icon";
  iconBox.style.cssText = `background:${color}1A;color:${color};border-color:${color}40;`;
  iconBox.innerHTML = icon;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = description;
  const action = document.createElement("div");
  action.className = "hub-action";
  action.textContent = "Acessar painel ↗";
  card.append(iconBox, heading, paragraph, action);
  return card;
}

function showError(message) {
  hubGrid.replaceChildren();
  const box = document.createElement("div");
  box.className = "empty-state";
  box.style.cssText = "grid-column:1/-1;color:#f06ca8;border-color:rgba(240,108,168,.3)";
  const title = document.createElement("strong");
  title.textContent = "Não foi possível carregar seu painel";
  const detail = document.createElement("p");
  detail.textContent = message;
  box.append(title, detail);
  hubGrid.append(box);
}

async function loadNotifications(user) {
  const panel = document.createElement("section");
  panel.id = "user-notifications";
  panel.style.cssText = "margin:0 0 22px;padding:18px;border:1px solid rgba(215,173,101,.35);border-radius:14px;background:rgba(20,24,34,.88);color:#f4f1e9";
  const heading = document.createElement("h2");
  heading.textContent = "Notificações";
  const body = document.createElement("p");
  body.textContent = "Carregando avisos…";
  panel.append(heading, body);
  hubGrid.insertAdjacentElement("beforebegin", panel);
  try {
    const data = await api(user, "/api/notificacoes");
    const items = Array.isArray(data.items) ? data.items : [];
    heading.textContent = `Notificações (${data.naoLidas || 0} não lidas)`;
    body.remove();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhuma notificação no momento.";
      panel.append(empty);
      return;
    }
    for (const item of items) {
      const article = document.createElement("article");
      article.style.cssText = "padding:10px 0;border-top:1px solid #38343a";
      const title = document.createElement("strong");
      title.textContent = item.titulo || "Aviso";
      const message = document.createElement("p");
      message.textContent = item.mensagem || "";
      const date = document.createElement("small");
      date.textContent = item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "";
      article.append(title, message, date);
      if (item.link) {
        const link = document.createElement("a");
        link.href = item.link;
        link.textContent = "Abrir";
        article.append(" ", link);
      }
      if (!item.lida && item.id) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Marcar como lida";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api(user, `/api/notificacoes/${encodeURIComponent(item.id)}/lida`, { method: "PATCH" });
            panel.remove();
            await loadNotifications(user);
          } catch (error) {
            button.disabled = false;
            button.textContent = error.message;
          }
        });
        article.append(" ", button);
      }
      panel.append(article);
    }
  } catch (error) {
    body.textContent = `Notificações indisponíveis: ${error.message}`;
  }
}

async function renderHub(user) {
  if (!hubGrid) return;
  hubGrid.replaceChildren();
  try {
    const data = await api(user, "/api/auth/perfil");
    const profile = data.perfil;
    if (!profile) throw new Error("Perfil não encontrado. Entre em contato com o administrador.");
    if (profile.ativo !== true || profile.status !== "ativo") {
      throw new Error("Sua conta está aguardando aprovação ou está inativa.");
    }
    const role = profile.papel;
    if (!["cliente", "corretor", "administrador", "gerente"].includes(role)) {
      throw new Error("Seu perfil não possui um nível de acesso válido.");
    }

    if (role === "cliente") {
      hubGrid.append(buildCard("Área do Cliente", "Acesse seus imóveis favoritos, histórico e preferências.", "/cliente.html", icons.cliente, "#57d9e0"));
    } else {
      hubGrid.append(buildCard("Painel do Corretor", "Gerencie sua carteira de imóveis, leads e agendamentos.", "/corretor.html", icons.corretor, "#e6b45a"));
      hubGrid.append(buildCard("CRM de Leads", "Organize oportunidades, acompanhe preferências e registre interações.", "/crm.html", icons.corretor, "#d7ad65"));
      hubGrid.append(buildCard("Agenda de Visitas", "Consulte visitas e acompanhe confirmações e resultados.", "/agenda.html", icons.corretor, "#57d9e0"));
      if (role === "administrador") {
        hubGrid.append(buildCard("Administração", "Gerencie usuários, permissões, imóveis e relatórios.", "/admin.html", icons.admin, "#f06ca8"));
      }
      if (role === "gerente") {
        hubGrid.append(buildCard("Painel de Gerência", "Acompanhe a equipe, imóveis, leads e visitas.", "/gerencia.html", icons.admin, "#d7ad65"));
      }
    }
    if (!hubGrid.children.length) throw new Error("Nenhuma área está disponível para este perfil.");
    await loadNotifications(user);
  } catch (error) {
    showError(error.message || "Erro inesperado ao carregar os cartões.");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }
  if (userEmail) userEmail.textContent = user.email || "Conta autenticada";
  await renderHub(user);
});

$("#btn-logout")?.addEventListener("click", async () => {
  const button = $("#btn-logout");
  if (button) button.disabled = true;
  try {
    await signOut(auth);
  } finally {
    window.location.replace("/login.html");
  }
});
