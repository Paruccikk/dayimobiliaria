import { fetchProperties, propertyCard } from "./common.js";
document.querySelector("#year").textContent = new Date().getFullYear();
const grid = document.querySelector("#featured-grid");
let all = [];
try {
  all = await fetchProperties();
  grid.innerHTML = all.length ? all.slice(0, 6).map(propertyCard).join("") : '<div class="empty-state">Ainda não há imóveis publicados. Volte em breve para conhecer nossa seleção.</div>';
} catch (_err) {
  grid.innerHTML = '<div class="empty-state">A vitrine será exibida quando a integração com o Firebase estiver configurada no servidor.</div>';
}
document.querySelector("#search-form").addEventListener("submit", e => {
  e.preventDefault();
  const params = new URLSearchParams();
  for (const [id, key] of [["categoria","categoria"],["finalidade","finalidade"],["localizacao","localizacao"],["preco-max","precoMax"]]) {
    const value = document.getElementById(id).value.trim();
    if (value) params.set(key, value);
  }
  location.href = `/imoveis.html?${params}`;
});
document.querySelector("#lead-form").addEventListener("submit", async e => {
  e.preventDefault();
  const feedback = document.querySelector("#lead-feedback");
  const body = { nome: document.querySelector("#lead-nome").value, telefone: document.querySelector("#lead-telefone").value, mensagem: document.querySelector("#lead-mensagem").value };
  try {
    const r = await fetch("/api/leads", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Falha ao enviar.");
    feedback.textContent = "Contato registrado! Nossa equipe poderá retornar para você.";
    e.target.reset();
  } catch (err) { feedback.textContent = err.message || "Não foi possível enviar. Tente novamente mais tarde."; }
});
