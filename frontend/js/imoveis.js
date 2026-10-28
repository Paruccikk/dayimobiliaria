import { fetchProperties, propertyCard } from "./common.js";

/* ============================================
   Config básico
   ============================================ */
document.querySelector("#year").textContent = new Date().getFullYear();

/* ============================================
   Estado
   ============================================ */
let all = [];
const grid = document.querySelector("#property-grid");
const countEl = document.querySelector("#property-count");
const chipsEl = document.querySelector("#filters-active");

const inputs = {
  categoria: document.querySelector("#categoria"),
  finalidade: document.querySelector("#finalidade"),
  localizacao: document.querySelector("#localizacao"),
  precoMax: document.querySelector("#preco-max"),
};

const params = new URLSearchParams(location.search);
for (const [key, id] of [
  ["categoria", "categoria"],
  ["finalidade", "finalidade"],
  ["localizacao", "localizacao"],
  ["precoMax", "preco-max"],
]) {
  if (params.has(key)) document.getElementById(id).value = params.get(key);
}

/* ============================================
   Stats do hero
   ============================================ */
function renderStats() {
  const total = all.length;
  const venda = all.filter((p) => p.finalidade === "venda").length;
  const locacao = all.filter((p) => p.finalidade === "locacao").length;

  animateNumber(document.querySelector("#stat-total"), total);
  animateNumber(document.querySelector("#stat-venda"), venda);
  animateNumber(document.querySelector("#stat-locacao"), locacao);
}

function animateNumber(el, target) {
  if (!el) return;
  if (target === 0) { el.textContent = "0"; return; }
  let current = 0;
  const step = Math.max(1, Math.floor(target / 30));
  const tick = () => {
    current += step;
    if (current >= target) { el.textContent = target + "+"; return; }
    el.textContent = current;
    requestAnimationFrame(tick);
  };
  tick();
}

/* ============================================
   Chips de filtros ativos
   ============================================ */
const LABELS = {
  categoria: "Categoria",
  finalidade: "Finalidade",
  localizacao: "Local",
  precoMax: "Até R$",
};

function renderChips() {
  if (!chipsEl) return;
  const active = [];
  for (const [key, input] of Object.entries(inputs)) {
    const v = input.value.trim();
    if (!v) continue;
    active.push({ key, label: LABELS[key], value: v });
  }

  if (active.length === 0) {
    chipsEl.innerHTML = "";
    return;
  }

  chipsEl.innerHTML = active
    .map(
      (c) => `
      <span class="filter-chip">
        <strong>${c.label}:</strong> ${escapeHtml(c.value)}
        <button type="button" data-remove="${c.key}" aria-label="Remover filtro">&times;</button>
      </span>`
    )
    .join("");

  chipsEl.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.remove;
      inputs[key].value = "";
      render();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ============================================
   Render principal
   ============================================ */
function render() {
  const cat = inputs.categoria.value;
  const pur = inputs.finalidade.value;
  const loc = inputs.localizacao.value.trim().toLocaleLowerCase("pt-BR");
  const max = Number(inputs.precoMax.value) || Infinity;

  const filtered = all.filter(
    (p) =>
      (!cat || p.categoria === cat) &&
      (!pur || p.finalidade === pur) &&
      (!loc ||
        [p.cidade, p.bairro, p.estado, p.titulo].some((v) =>
          String(v || "").toLocaleLowerCase("pt-BR").includes(loc)
        )) &&
      (p.preco == null || Number(p.preco) <= max)
  );

  countEl.textContent = `${filtered.length} imóvel(is) encontrado(s)`;
  grid.innerHTML = filtered.length
    ? filtered.map(propertyCard).join("")
    : '<div class="empty-state">Nenhum imóvel corresponde aos filtros. Experimente alterar a busca.</div>';

  renderChips();
}

/* ============================================
   Carregar dados
   ============================================ */
try {
  all = await fetchProperties();
  render();
  renderStats();
  grid.classList.add("rendered");
} catch (_err) {
  grid.innerHTML =
    '<div class="empty-state">Não foi possível carregar a carteira. Configure o Firebase no servidor.</div>';
  countEl.textContent = "Erro ao carregar";
}

/* ============================================
   Form submit
   ============================================ */
document.querySelector("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  render();

  /* ✅ URL sem quebrar em ambientes que restringem history API */
  try {
    const qp = new URLSearchParams();
    for (const [key, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      if (v) qp.set(key, v);
    }
    const qs = qp.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  } catch (_) { /* noop */ }
});

/* ============================================
   Toggle grid / lista
   ============================================ */
document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    grid.dataset.view = btn.dataset.view;
  });
});

/* ============================================
   Efeitos globais
   ============================================ */

/* ---------- Cursor customizado ---------- */
const dot = document.querySelector(".cursor-dot");
const ring = document.querySelector(".cursor-ring");
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

if (dot && ring) {
  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%,-50%)`;
  }, { passive: true });

  const animateRing = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%,-50%)`;
    requestAnimationFrame(animateRing);
  };
  animateRing();

  /* ✅ Removido .property-card e .magnetic da lista de grow — só o link <a> */
  document
    .querySelectorAll("a, button, .field input, .field select, .view-btn, .filter-chip")
    .forEach((el) => {
      el.addEventListener("mouseenter", () => ring.classList.add("grow"), { passive: true });
      el.addEventListener("mouseleave", () => ring.classList.remove("grow"), { passive: true });
    });
}

/* ---------- Navbar scroll + progress ---------- */
const navbar = document.getElementById("navbar");
const progress = document.getElementById("scroll-progress");
window.addEventListener("scroll", () => {
  if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 20);
  const h = document.documentElement;
  const scrolled = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  if (progress) progress.style.width = scrolled + "%";
}, { passive: true });

/* ---------- Mobile menu ---------- */
const toggle = document.getElementById("nav-toggle");
const links = document.querySelector(".nav-links");
if (toggle && links) {
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("active");
    links.classList.toggle("open");
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      toggle.classList.remove("active");
      links.classList.remove("open");
    })
  );
}

/* ---------- Magnetic (com correção) ---------- */
document.querySelectorAll(".magnetic").forEach((btn) => {
  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    /* ✅ Limita o deslocamento para nunca mover o botão para fora do bounding box */
    const maxX = 4;
    const maxY = 4;
    const dx = Math.max(-maxX, Math.min(maxX, x * 0.18));
    const dy = Math.max(-maxY, Math.min(maxY, y * 0.25));
    btn.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "";
  });
});

/* ---------- Reveal ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));