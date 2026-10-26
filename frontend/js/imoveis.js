import { fetchProperties, propertyCard } from "./common.js";
document.querySelector("#year").textContent = new Date().getFullYear();
const params = new URLSearchParams(location.search);
for (const [key, id] of [["categoria","categoria"],["finalidade","finalidade"],["localizacao","localizacao"],["precoMax","preco-max"]]) {
  if (params.has(key)) document.getElementById(id).value = params.get(key);
}
let all = [];
const grid = document.querySelector("#property-grid");
function render() {
  const cat = document.querySelector("#categoria").value;
  const pur = document.querySelector("#finalidade").value;
  const loc = document.querySelector("#localizacao").value.trim().toLocaleLowerCase("pt-BR");
  const max = Number(document.querySelector("#preco-max").value) || Infinity;
  const filtered = all.filter(p => (!cat || p.categoria === cat) && (!pur || p.finalidade === pur) && (!loc || [p.cidade,p.bairro,p.estado,p.titulo].some(v => String(v||"").toLocaleLowerCase("pt-BR").includes(loc))) && (p.preco == null || Number(p.preco) <= max));
  document.querySelector("#property-count").textContent = `${filtered.length} imóvel(is) encontrado(s)`;
  grid.innerHTML = filtered.length ? filtered.map(propertyCard).join("") : '<div class="empty-state">Nenhum imóvel corresponde aos filtros. Experimente alterar a busca.</div>';
}
try { all = await fetchProperties(); render(); } catch (_err) { grid.innerHTML = '<div class="empty-state">Não foi possível carregar a carteira. Configure o Firebase no servidor.</div>'; }
document.querySelector("#search-form").addEventListener("submit", e => { e.preventDefault(); render(); });
document.querySelector("#year").textContent = new Date().getFullYear();
