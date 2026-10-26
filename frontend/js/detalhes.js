import { money, categoryLabel, purposeLabel, safeText } from "./common.js";
document.querySelector("#year").textContent = new Date().getFullYear();
const id = new URLSearchParams(location.search).get("id");
const root = document.querySelector("#property-detail");
if (!id) root.innerHTML = '<div class="empty-state">Código do imóvel não informado.</div>';
else {
  try {
    const r = await fetch(`/api/imoveis/${encodeURIComponent(id)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Imóvel não encontrado.");
    const p = d.item;
    const photo = p.fotos?.[0] || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85";
    const location = [p.bairro,p.cidade,p.estado].filter(Boolean).join(", ");
    const waMessage = encodeURIComponent(`Olá! Tenho interesse no imóvel ${p.titulo} (ref. ${p.codigo || p.id}). Gostaria de mais informações.`);
    root.innerHTML = `<div class="eyebrow">${safeText(categoryLabel(p.categoria))} · ${safeText(purposeLabel(p.finalidade))}</div><h1 style="font:500 clamp(32px,5vw,48px) 'Playfair Display',serif">${safeText(p.titulo)}</h1><p class="property-location">${safeText(location)}</p><div class="detail-grid" style="margin-top:28px"><div><img class="detail-main-image" src="${safeText(photo)}" alt="${safeText(p.titulo)}"><div class="feature-grid" style="margin-top:16px">${(p.fotos||[]).slice(1).map(src=>`<img style="width:100%;height:140px;object-fit:cover;border-radius:12px" src="${safeText(src)}" alt="Foto do imóvel">`).join("")}</div><section class="section" style="padding:32px 0"><h2>Sobre o imóvel</h2><p style="line-height:1.8;white-space:pre-line">${safeText(p.descricao || "Entre em contato com nossa equipe para saber mais sobre este imóvel.")}</p></section></div><aside class="detail-card"><div class="property-location">REF. ${safeText((p.codigo||p.id).slice(0,12).toUpperCase())}</div><div class="property-price" style="font-size:28px">${money(p.preco)}</div><div class="property-features">${p.areaM2?`<span>▱ ${safeText(p.areaM2)} m²</span>`:""}${p.quartos?`<span>▦ ${safeText(p.quartos)} quartos</span>`:""}${p.suites?`<span>${safeText(p.suites)} suítes</span>`:""}${p.banheiros?`<span>${safeText(p.banheiros)} banheiros</span>`:""}${p.vagas?`<span>⌑ ${safeText(p.vagas)} vagas</span>`:""}</div><a class="button button-gold" style="width:100%;margin-top:24px" target="_blank" rel="noopener" href="https://wa.me/?text=${waMessage}">Consultar pelo WhatsApp ↗</a><p class="property-location" style="margin-top:15px">Nossa equipe está à disposição para fornecer mais detalhes e agendar uma visita.</p></aside></div>`;
  } catch (err) { root.innerHTML = `<div class="empty-state">${safeText(err.message)}</div>`; }
}
