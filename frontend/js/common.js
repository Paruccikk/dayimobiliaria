export const money = value => value == null || value === "" ? "Consulte o valor" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value));
export const categoryLabel = value => ({ residencial:"Residencial", comercial:"Comercial", sublocacao:"Sublocação", garagem:"Garagem", lancamento:"Lançamento" }[value] || value || "Imóvel");
export const purposeLabel = value => ({ venda:"À venda", locacao:"Para locação", temporada:"Temporada" }[value] || value || "");
export function safeText(value="") { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
export function propertyCard(p) {
  const img = p.fotos?.[0] || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80";
  const location = [p.bairro, p.cidade, p.estado].filter(Boolean).join(", ");
  return `<article class="property-card"><a href="/detalhes.html?id=${encodeURIComponent(p.id)}"><div class="property-image"><img loading="lazy" src="${safeText(img)}" alt="${safeText(p.titulo)}"><span class="property-tag">${safeText(purposeLabel(p.finalidade))}</span></div><div class="property-body"><div class="property-code">${safeText(categoryLabel(p.categoria))} · REF. ${safeText((p.codigo || p.id || "").slice(0,10).toUpperCase())}</div><h3 class="property-title">${safeText(p.titulo)}</h3><div class="property-location">${safeText(location || "Consulte a localização")}</div><div class="property-price">${money(p.preco)}</div><div class="property-features">${p.areaM2 ? `<span>▱ ${safeText(p.areaM2)} m²</span>` : ""}${p.quartos ? `<span>▦ ${safeText(p.quartos)} quartos</span>` : ""}${p.vagas ? `<span>⌑ ${safeText(p.vagas)} vagas</span>` : ""}</div></div></a></article>`;
}
export async function fetchProperties() {
  const response = await fetch("/api/imoveis");
  if (!response.ok) throw new Error("Não foi possível carregar os imóveis.");
  const data = await response.json();
  return data.items || [];
}
