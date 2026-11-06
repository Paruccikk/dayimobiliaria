import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
const hubGrid = $("#hub-grid");
const userEmail = $("#user-email");

// Ícones SVG para os cartões
const icons = {
  cliente: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  corretor: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>`,
  admin: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 8h5"/><path d="M13 12h5"/><path d="M13 16h5"/></svg>`,
  gerente: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`
};

async function api(url, options = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro de conexão.");
  return data;
}

async function loadNotifications() {
  const panel = document.createElement("section");
  panel.style.cssText = "grid-column:1/-1;margin:0 0 22px;padding:18px;border:1px solid rgba(215,173,101,.35);border-radius:14px;background:rgba(20,24,34,.88);color:#f4f1e9";
  panel.innerHTML = "<h2>Notificações</h2><p>Carregando avisos…</p>";
  hubGrid.parentElement.insertBefore(panel, hubGrid);
  const esc = value => String(value ?? "").replace(/[&<>"\x27]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\x27":"&#39;"}[c]));
  try {
    const data = await api("/api/notificacoes"); const items = data.items || [];
    panel.innerHTML = "<h2>Notificações (" + (data.naoLidas || 0) + " não lidas)</h2>" + (items.length ? items.map(item => "<article style=\"padding:10px 0;border-top:1px solid #38343a\"><strong>" + esc(item.titulo) + "</strong><p>" + esc(item.mensagem) + "</p><small>" + esc(item.criadoEm ? new Date(item.criadoEm).toLocaleString(\"pt-BR\") : "") + "</small> " + (item.link ? "<a href=\"" + esc(item.link) + "\">Abrir</a> " : "") + (!item.lida ? "<button data-notification-read=\"" + esc(item.id) + "\">Marcar como lida</button>" : "") + "</article>").join("") : "<p>Nenhuma notificação no momento.</p>");
    panel.querySelectorAll("[data-notification-read]").forEach(button => button.addEventListener("click", async () => { button.disabled = true; await api("/api/notificacoes/" + encodeURIComponent(button.dataset.notificationRead) + "/lida", {method:"PATCH"}); await loadNotifications(); }));
  } catch(error) { panel.innerHTML = "<h2>Notificações</h2><p>" + esc(error.message) + "</p>"; }
}
function buildCard(title, desc, link, icon, color) {
  return `
    <a href="${link}" class="hub-card">
      <div class="hub-icon" style="background:${color}1A; color:${color}; border-color:${color}40;">
        ${icon}
      </div>
      <h2>${title}</h2>
      <p>${desc}</p>
      <div class="hub-action">Acessar painel <span>↗</span></div>
    </a>
  `;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }

  userEmail.textContent = user.email;

  try {
    // Valida o perfil no servidor
    const data = await api("/api/auth/perfil");
    const profile = data.perfil;
    const managerCard = document.querySelector("#manager-panel-card");

    if (!profile) {
      throw new Error("Perfil não cadastrado. Entre em contato com o suporte.");
    }
    if (profile.ativo !== true || profile.status !== "ativo") {
      throw new Error("Sua conta está inativa ou aguardando aprovação.");
    }

    let html = "";

    // Gerentes e administradores acessam o painel de gerência.
    if (["gerente", "administrador"].includes(profile.papel)) {
      html += buildCard(
        "Painel do Gerente",
        "Acompanhe a equipe, a produtividade dos corretores, imóveis, leads e visitas.",
        "/gerencia.html",
        icons.gerente,
        "#d7ad65"
      );
    }

    // 1. Todos os usuários ativos têm acesso ao painel de cliente
    html += buildCard(
      "Área do Cliente",
      "Acesse seus imóveis favoritos, histórico e preferências.",
      "/cliente.html",
      icons.cliente,
      "#57d9e0" // Azul ciano
    );

    // 2. Corretores e Admins acessam o painel do corretor
    if (["corretor", "gerente", "administrador"].includes(profile.papel)) {
      html += buildCard(
        "Painel do Corretor",
        "Gerencie sua carteira de imóveis, leads e agendamentos.",
        "/corretor.html", // Rota futura do corretor
        icons.corretor,
        "#e6b45a" // Dourado
      );
    }

    // 3. Apenas Admins acessam o painel Admin
    if (profile.papel === "administrador") {
      html += buildCard(
        "Administração",
        "Gestão completa de usuários, imóveis e relatórios da imobiliária.",
        "/admin.html",
        icons.admin,
        "#f06ca8" // Rosa/Pink
      );
    }

    if (["corretor", "administrador", "gerente"].includes(profile.papel)) {
      html += buildCard(
        "CRM de Leads",
        "Organize oportunidades em Kanban, acompanhe preferências e registre cada interação.",
        "/crm.html",
        icons.corretor,
        "#d7ad65"
      );
    }

    if (["corretor", "administrador"].includes(profile.papel)) {
      html += buildCard("Agenda de Visitas", "Consulte a agenda diária e semanal e acompanhe os resultados das visitas.", "/agenda.html", icons.corretor, "#d7ad65");
    }

    hubGrid.innerHTML = html;
    await loadNotifications();

  } catch (err) {
    hubGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; color: #f06ca8; border-color: rgba(240,108,168,0.3);">
        <strong>Acesso Negado</strong><br>
        ${err.message}
      </div>
    `;
  }
});

// Botão de logout
$("#btn-logout").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("/login.html");
  } catch (err) {
    alert("Erro ao sair.");
  }
});