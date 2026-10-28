import { fetchProperties, propertyCard } from "./common.js";

/* ============================================
   Config básico
   ============================================ */
document.querySelector("#year").textContent = new Date().getFullYear();

/* ============================================
   Imóveis em destaque
   ============================================ */
const grid = document.querySelector("#featured-grid");
let all = [];

try {
  all = await fetchProperties();
  grid.innerHTML = all.length
    ? all.slice(0, 6).map(propertyCard).join("")
    : '<div class="empty-state">Ainda não há imóveis publicados. Volte em breve para conhecer nossa seleção.</div>';
} catch (_err) {
  grid.innerHTML =
    '<div class="empty-state">A vitrine será exibida quando a integração com o Firebase estiver configurada no servidor.</div>';
}

/* ============================================
   Busca
   ============================================ */
document.querySelector("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const params = new URLSearchParams();
  for (const [id, key] of [
    ["categoria", "categoria"],
    ["finalidade", "finalidade"],
    ["localizacao", "localizacao"],
    ["preco-max", "precoMax"],
  ]) {
    const value = document.getElementById(id).value.trim();
    if (value) params.set(key, value);
  }
  location.href = `/imoveis.html?${params}`;
});

/* ============================================
   Lead form
   ============================================ */
document.querySelector("#lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.querySelector("#lead-feedback");
  const body = {
    nome: document.querySelector("#lead-nome").value,
    telefone: document.querySelector("#lead-telefone").value,
    mensagem: document.querySelector("#lead-mensagem").value,
  };
  try {
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Falha ao enviar.");
    feedback.textContent = "✓ Contato registrado! Nossa equipe poderá retornar para você.";
    feedback.style.color = "var(--gold-2)";
    e.target.reset();
  } catch (err) {
    feedback.textContent = err.message || "Não foi possível enviar. Tente novamente mais tarde.";
    feedback.style.color = "#f06ca8";
  }
});

/* ============================================
   Cursor customizado
   ============================================ */
const dot = document.querySelector(".cursor-dot");
const ring = document.querySelector(".cursor-ring");
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

window.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (dot) dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%,-50%)`;
});

function animateRing() {
  ringX += (mouseX - ringX) * 0.18;
  ringY += (mouseY - ringY) * 0.18;
  if (ring) ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%,-50%)`;
  requestAnimationFrame(animateRing);
}
if (ring) animateRing();

document.querySelectorAll("a, button, .field input, .field select, .field textarea, .feature, .property-card").forEach((el) => {
  el.addEventListener("mouseenter", () => ring && ring.classList.add("grow"));
  el.addEventListener("mouseleave", () => ring && ring.classList.remove("grow"));
});
// grow style inline (CSS-less)
const styleEl = document.createElement("style");
styleEl.textContent = `.cursor-ring.grow { width: 58px; height: 58px; border-color: rgba(230,180,90,0.9); background: rgba(230,180,90,0.06); }`;
document.head.appendChild(styleEl);

/* ============================================
   Magnetic buttons
   ============================================ */
document.querySelectorAll(".magnetic").forEach((btn) => {
  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.18}px, ${y * 0.25}px)`;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "";
  });
});

/* ============================================
   Reveal on scroll
   ============================================ */
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

/* ============================================
   Navbar scroll state + progress
   ============================================ */
const navbar = document.getElementById("navbar");
const progress = document.getElementById("scroll-progress");
window.addEventListener("scroll", () => {
  if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 20);
  const h = document.documentElement;
  const scrolled = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  if (progress) progress.style.width = scrolled + "%";
});

/* ============================================
   Mobile menu
   ============================================ */
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

/* ============================================
   Contador animado (hero stats)
   ============================================ */
const stats = document.querySelectorAll(".stat strong[data-count]");
const countIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      let current = 0;
      const step = Math.max(1, Math.floor(target / 60));
      const tick = () => {
        current += step;
        if (current >= target) {
          el.textContent = target + (target === 98 ? "%" : "+");
          return;
        }
        el.textContent = current;
        requestAnimationFrame(tick);
      };
      tick();
      countIO.unobserve(el);
    });
  },
  { threshold: 0.5 }
);
stats.forEach((s) => countIO.observe(s));

/* ============================================
   Tilt effect nos cards de features
   ============================================ */
document.querySelectorAll(".tilt-card").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
});

/* ============================================
   Parallax suave nos orbs do hero
   ============================================ */
const hero = document.getElementById("hero");
if (hero && window.matchMedia("(hover:hover)").matches) {
  hero.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    hero.querySelectorAll(".orb").forEach((orb, i) => {
      const f = (i + 1) * 0.6;
      orb.style.transform = `translate(${x * f}px, ${y * f}px)`;
    });
  });
}