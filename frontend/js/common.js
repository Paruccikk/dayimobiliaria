// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================
export const money = value => value == null || value === "" ? "Consulte o valor" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value));

export const categoryLabel = value => ({ residencial: "Residencial", comercial: "Comercial", sublocacao: "Sublocação", garagem: "Garagem", lancamento: "Lançamento" }[value] || value || "Imóvel");

export const purposeLabel = value => ({ venda: "À venda", locacao: "Para locação", temporada: "Temporada" }[value] || value || "");

export function safeText(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================
// LÓGICA DE FAVORITOS (LocalStorage)
// ============================================
export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("@rd-prime/favorites") || "[]");
  } catch {
    return [];
  }
}

export function isFavorite(id) {
  return getFavorites().includes(id);
}

export function toggleFavorite(id) {
  let favorites = getFavorites();
  const isFav = favorites.includes(id);

  if (isFav) {
    favorites = favorites.filter(favId => favId !== id);
  } else {
    favorites.push(id);
  }

  localStorage.setItem("@rd-prime/favorites", JSON.stringify(favorites));
  return !isFav; // Retorna o novo estado
}

// ============================================
// COMPONENTE: CARD DO IMÓVEL
// ============================================
export function propertyCard(p) {
  const img = p.fotos?.[0] || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80";
  const location = [p.bairro, p.cidade, p.estado].filter(Boolean).join(", ");
  
  // Verifica se este imóvel já está nos favoritos
  const isFav = isFavorite(p.id);
  
  // Botão de Coração com o estado correto
  const heartIcon = `
    <button class="fav-btn" data-id="${p.id}" aria-label="Favoritar imóvel" style="position:absolute; top:14px; right:14px; z-index:10; background:${isFav ? 'rgba(240,108,168,0.9)' : 'rgba(0,0,0,0.5)'}; border:1px solid rgba(255,255,255,0.2); color:#fff; width:36px; height:36px; border-radius:50%; cursor:pointer; display:grid; place-items:center; backdrop-filter: blur(4px); transition: all 0.2s;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    </button>
  `;

  return `
  <article class="property-card" style="position:relative;">
    <a href="/detalhes.html?id=${encodeURIComponent(p.id)}">
      <div class="property-image">
        <img loading="lazy" src="${safeText(img)}" alt="${safeText(p.titulo)}">
        <span class="property-tag">${safeText(purposeLabel(p.finalidade))}</span>
        ${heartIcon}
      </div>
      <div class="property-body">
        <div class="property-code">${safeText(categoryLabel(p.categoria))} · REF. ${safeText((p.codigo || p.id || "").slice(0,10).toUpperCase())}</div>
        <h3 class="property-title">${safeText(p.titulo)}</h3>
        <div class="property-location">${safeText(location || "Consulte a localização")}</div>
        <div class="property-price">${money(p.preco)}</div>
        <div class="property-features">
          ${p.areaM2 ? `<span>▱ ${safeText(p.areaM2)} m²</span>` : ""}
          ${p.quartos ? `<span>▦ ${safeText(p.quartos)} quartos</span>` : ""}
          ${p.vagas ? `<span>⌑ ${safeText(p.vagas)} vagas</span>` : ""}
        </div>
      </div>
    </a>
  </article>`;
}

// ============================================
// EVENT LISTENER GLOBAL (Delegação de Eventos)
// ============================================
if (typeof window !== "undefined") {
  // Garante que o evento só seja registrado uma vez na página
  if (!window.__favListenerAttached) {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".fav-btn");
      if (!btn) return;

      e.preventDefault(); 
      e.stopPropagation();

      const id = btn.dataset.id;
      const isNowFav = toggleFavorite(id); // Salva e retorna o novo estado

      // Atualiza a UI do botão instantaneamente
      if (isNowFav) {
        btn.style.background = "rgba(240,108,168,0.9)"; // Rosa
        btn.querySelector("svg").setAttribute("fill", "currentColor");
      } else {
        btn.style.background = "rgba(0,0,0,0.5)";
        btn.querySelector("svg").setAttribute("fill", "none");
      }
    });
    
    // Marca que o listener já está ativo para não duplicar
    window.__favListenerAttached = true;
  }
}

// ============================================
// FETCH DE IMÓVEIS
// ============================================
export async function fetchProperties() {
  const response = await fetch("/api/imoveis");
  if (!response.ok) throw new Error("Não foi possível carregar os imóveis.");
  const data = await response.json();
  return data.items || [];
}