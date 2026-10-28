import { money, categoryLabel, purposeLabel, safeText } from "./common.js";

document.querySelector("#year").textContent = new Date().getFullYear();

const id = new URLSearchParams(location.search).get("id");
const root = document.querySelector("#property-detail");

/* Fallback de imagem */
const FALLBACK =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85";

if (!id) {
  root.innerHTML = '<div class="empty-state">Código do imóvel não informado.</div>';
} else {
  try {
    const r = await fetch(`/api/imoveis/${encodeURIComponent(id)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Imóvel não encontrado.");

    const p = d.item;
    const photos = (p.fotos || []).filter(Boolean);
    const cover = photos[0] || FALLBACK;
    const gallery = photos.slice(1);

    const location = [p.bairro, p.cidade, p.estado].filter(Boolean).join(", ");

    const waMessage = encodeURIComponent(
      `Olá! Tenho interesse no imóvel ${p.titulo} (ref. ${p.codigo || p.id}). Gostaria de mais informações.`
    );

    /* Monta features estruturadas (chave/valor para o aside) */
    const features = [
      p.areaM2 && { value: p.areaM2, label: "m²" },
      p.quartos && { value: p.quartos, label: p.quartos == 1 ? "quarto" : "quartos" },
      p.suites && { value: p.suites, label: p.suites == 1 ? "suíte" : "suítes" },
      p.banheiros && { value: p.banheiros, label: p.banheiros == 1 ? "banheiro" : "banheiros" },
      p.vagas && { value: p.vagas, label: p.vagas == 1 ? "vaga" : "vagas" },
    ].filter(Boolean);

    const featuresHTML = features.length
      ? `<div class="detail-features">
          ${features
            .map(
              (f) => `
            <div>
              <strong>${safeText(f.value)}</strong>
              <span>${safeText(f.label)}</span>
            </div>`
            )
            .join("")}
        </div>`
      : "";

    /* Ícones dos cards resumidos (usados no topo dos cards das fotos) */
    const featurePills = [
      p.areaM2 && `<span>▱ ${safeText(p.areaM2)} m²</span>`,
      p.quartos && `<span>▦ ${safeText(p.quartos)} quartos</span>`,
      p.vagas && `<span>⌑ ${safeText(p.vagas)} vagas</span>`,
    ]
      .filter(Boolean)
      .join("");

    root.innerHTML = `
      <div class="detail-grid">
        <div class="detail-main">
          <div class="detail-header">
            <div class="detail-category">
              ${safeText(categoryLabel(p.categoria))} · ${safeText(purposeLabel(p.finalidade))}
            </div>
            <h1 class="detail-title">${safeText(p.titulo)}</h1>
            <p class="detail-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${safeText(location || "Consulte a localização")}
            </p>
          </div>

          <div class="detail-gallery">
            <img class="detail-main-image" src="${safeText(cover)}" alt="${safeText(p.titulo)}">
          </div>

          ${
            gallery.length
              ? `<div class="detail-thumbs">
                  ${gallery
                    .map(
                      (src) =>
                        `<img loading="lazy" src="${safeText(src)}" alt="Foto do imóvel ${safeText(p.titulo)}">`
                    )
                    .join("")}
                </div>`
              : ""
          }

          <section class="detail-about">
            <h2>Sobre o imóvel</h2>
            <p>${safeText(
              p.descricao || "Entre em contato com nossa equipe para saber mais sobre este imóvel."
            )}</p>
          </section>
        </div>

        <aside class="detail-card">
          <div class="detail-ref">REF. ${safeText(String(p.codigo || p.id || "").slice(0, 12).toUpperCase())}</div>

          <div class="detail-price">
            <small>Valor</small>
            ${money(p.preco)}
          </div>

          ${featuresHTML}

          ${featurePills ? `<div class="property-features">${featurePills}</div>` : ""}

          <a class="button button-gold detail-cta" target="_blank" rel="noopener"
             href="https://wa.me/?text=${waMessage}">
            <span>Consultar pelo WhatsApp</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
          </a>

          <p class="detail-note">
            Nossa equipe está à disposição para fornecer mais detalhes e agendar uma visita.
          </p>
        </aside>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state">${safeText(err.message)}</div>`;
  }
}