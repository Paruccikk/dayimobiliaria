import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const hubGrid = $("#hub-grid");
const userEmail = $("#user-email");
const VISITOR_KEY = "rdprime.alertaDay.visitor.v1";

const icons = {
  cliente: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  corretor: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>',
  admin: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M13 8h5M13 12h5M13 16h5"/></svg>'
};

function visitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "rd-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

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

async function loadWhatsAppConsent(user) {
  const panel = document.createElement("section");
  panel.id = "whatsapp-consent-panel";
  panel.className = "whatsapp-consent-panel";
  panel.setAttribute("aria-labelledby", "whatsapp-consent-title");

  const heading = document.createElement("h2");
  heading.id = "whatsapp-consent-title";
  heading.textContent = "Alertas de imóveis pelo WhatsApp";

  const description = document.createElement("p");
  description.textContent = "Sua conta já está cadastrada. Se desejar, você pode autorizar o envio de alertas pelo WhatsApp usando o celular informado no seu cadastro. Essa escolha é independente da autorização de localização.";

  const status = document.createElement("p");
  status.className = "whatsapp-consent-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Verificando sua preferência…";

  const form = document.createElement("div");
  form.className = "whatsapp-consent-form";

  const label = document.createElement("label");
  label.className = "whatsapp-consent-label";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "whatsapp-consent-confirm";
  const labelText = document.createElement("span");
  labelText.textContent = "Autorizo receber alertas de imóveis e oportunidades da Day pelo WhatsApp no número de celular cadastrado. Sei que posso retirar esta autorização posteriormente.";
  label.append(checkbox, labelText);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-gold";
  button.textContent = "Confirmar autorização do WhatsApp";
  button.disabled = true;

  const note = document.createElement("small");
  note.textContent = "A autorização fica vinculada à sua conta e pode ser revogada a qualquer momento.";
  const revokeButton = document.createElement("button");
  revokeButton.type = "button";
  revokeButton.className = "button button-outline";
  revokeButton.textContent = "Revogar autorização";
  revokeButton.hidden = true;
  const denyButton = document.createElement("button");
  denyButton.type = "button";
  denyButton.className = "button button-outline";
  denyButton.textContent = "Não autorizo receber WhatsApp";

  checkbox.addEventListener("change", () => {
    button.disabled = !checkbox.checked;
  });

  button.addEventListener("click", async () => {
    if (!checkbox.checked) return;
    button.disabled = true;
    checkbox.disabled = true;
    status.textContent = "Registrando sua autorização…";
    try {
      await api(user, "/api/alerta-day/whatsapp/cadastro", {
        method: "POST",
        body: JSON.stringify({ visitorId: visitorId(), consentimento: true })
      });
      status.textContent = "Status: PERMITIDO. Sua autorização está vinculada à sua conta.";
      form.hidden = true;
      revokeButton.hidden = false;
    } catch (error) {
      status.textContent = error.message;
      checkbox.disabled = false;
      button.disabled = !checkbox.checked;
    }
  });

  denyButton.addEventListener("click", async () => {
    denyButton.disabled = true;
    status.textContent = "Registrando sua escolha…";
    try {
      await api(user, "/api/alerta-day/whatsapp/cadastro", {
        method: "POST",
        body: JSON.stringify({ visitorId: visitorId(), consentimento: false })
      });
      status.textContent = "Status: NEGADO. Você não receberá alertas pelo WhatsApp. É possível mudar essa escolha depois.";
      denyButton.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      denyButton.disabled = false;
    }
  });

  revokeButton.addEventListener("click", async () => {
    revokeButton.disabled = true;
    status.textContent = "Registrando revogação…";
    try {
      await api(user, "/api/alerta-day/whatsapp/cadastro", {
        method: "POST",
        body: JSON.stringify({ visitorId: visitorId(), consentimento: false })
      });
      status.textContent = "Status: NEGADO. Você não receberá alertas pelo WhatsApp.";
      revokeButton.hidden = true;
      form.hidden = false;
      checkbox.checked = false;
      checkbox.disabled = false;
      button.disabled = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      revokeButton.disabled = false;
    }
  });

  form.append(label, button, note, denyButton);
  panel.append(heading, description, status, form, revokeButton);
  hubGrid.insertAdjacentElement("beforebegin", panel);

  try {
    const data = await api(user, `/api/alerta-day/preferencias?visitorId=${encodeURIComponent(visitorId())}`);
    if (data.whatsappConsent === true) {
      status.textContent = "Status: PERMITIDO. Sua conta está autorizada a receber alertas pelo WhatsApp.";
      form.hidden = true;
      revokeButton.hidden = false;
    } else if (data.whatsappConsentStatus === "negado") {
      status.textContent = "Status: NEGADO. Você pode alterar sua escolha abaixo.";
      revokeButton.hidden = true;
      denyButton.hidden = true;
    } else {
      status.textContent = "Status: PENDENTE. Se quiser receber alertas, confirme abaixo.";
      revokeButton.hidden = true;
    }
  } catch (error) {
    status.textContent = `Não foi possível consultar a preferência: ${error.message}`;
  }
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
    const aliases = { admin: "administrador", manager: "gerente", broker: "corretor", client: "cliente" };
    const role = aliases[String(profile.papel || "").toLowerCase()] || String(profile.papel || "").toLowerCase();
    if (profile.ativo !== true || profile.status !== "ativo") {
      throw new Error("Sua conta está aguardando aprovação ou está inativa. Fale com a equipe pelo WhatsApp.");
    }
    if (!["cliente", "corretor", "gerente", "administrador"].includes(role)) {
      throw new Error("Seu perfil ainda não possui um nível de acesso válido. Fale com o administrador.");
    }

    const cards = [];
    if (role === "administrador") {
      cards.push(buildCard("Administração", "Gestão completa de usuários, imóveis, permissões e relatórios.", "/admin.html", icons.admin, "#f06ca8"));
      cards.push(buildCard("Painel do Gerente", "Audite equipes, produtividade, imóveis, leads e visitas.", "/gerencia.html", icons.admin, "#d7ad65"));
    }
    if (["gerente", "corretor", "administrador"].includes(role)) {
      if (role === "gerente") cards.push(buildCard("Painel do Gerente", "Acompanhe sua equipe, produtividade, imóveis, leads e visitas.", "/gerencia.html", icons.admin, "#d7ad65"));
      cards.push(buildCard("Painel do Corretor", "Consulte e gerencie a carteira conforme suas permissões.", "/corretor.html", icons.corretor, "#e6b45a"));
      cards.push(buildCard("CRM de Leads", "Organize oportunidades, acompanhe preferências e registre interações.", "/crm.html", icons.corretor, "#d7ad65"));
      cards.push(buildCard("Agenda de Visitas", "Consulte visitas, agendamentos e resultados.", "/agenda.html", icons.corretor, "#57d9e0"));
      cards.push(buildCard("Central de Materiais", "Acesse tabelas, plantas, imagens e PDFs dos empreendimentos autorizados.", "/materiais.html", icons.admin, "#8bc5a5"));
    }
    cards.push(buildCard("Área do Cliente", "Acesse seus imóveis favoritos, histórico e preferências.", "/cliente.html", icons.cliente, "#57d9e0"));
    hubGrid.replaceChildren(...cards);
    await loadNotifications(user);
    await loadWhatsAppConsent(user);
  } catch (error) {
    showError(error.message || "Não foi possível carregar os cartões.");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button-gold";
    retry.textContent = "Tentar novamente";
    retry.addEventListener("click", () => renderHub(user));
    hubGrid.append(retry);
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
