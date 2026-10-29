import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { propertyCard } from "./common.js";

const $ = selector => document.querySelector(selector);
const grid = $("#wishlist-grid");
const btnWhatsapp = $("#btn-whatsapp-favoritos");
const alertBox = $("#wishlist-alert");

// Pega a lista de IDs salvos no navegador
let favoriteIds = JSON.parse(localStorage.getItem("@rd-prime/favorites") || "[]");
let allProperties = [];

// Remove um item dos favoritos
window.removeFavorite = function(id) {
  favoriteIds = favoriteIds.filter(favId => favId !== id);
  localStorage.setItem("@rd-prime/favorites", JSON.stringify(favoriteIds));
  
  // Atualiza a tela
  renderWishlist();
};

function renderWishlist() {
  const myProperties = allProperties.filter(p => favoriteIds.includes(p.id));

  if (myProperties.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 60px 20px; text-align:center;">
        <h3 style="font-family:var(--font-display); margin-bottom: 10px;">Sua lista está vazia</h3>
        <p style="margin-bottom: 20px;">Você ainda não favoritou nenhum imóvel.</p>
        <a href="/imoveis.html" class="button button-gold">Explorar Imóveis</a>
      </div>
    `;
    btnWhatsapp.disabled = true;
    alertBox.style.display = "none";
    return;
  }

  // Renderiza usando a função padrão do seu common.js
  grid.innerHTML = myProperties.map(p => {
    // Vamos adicionar um botão de remover em cima do card
    // (Inserindo via replace na string do card original)
    const cardHtml = propertyCard(p);
    const btnRemove = `
      <button onclick="removeFavorite('${p.id}')" style="position:absolute; top:14px; right:14px; z-index:10; background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.2); color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer; display:grid; place-items:center; backdrop-filter: blur(4px); transition: background 0.2s;" onmouseover="this.style.background='#f06ca8'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="Remover dos favoritos">
        &times;
      </button>
    `;
    // Insere o botão dentro do .property-card
    return cardHtml.replace('<article class="property-card">', `<article class="property-card" style="position:relative;">${btnRemove}`);
  }).join("");

  // Configura o botão de WhatsApp
  btnWhatsapp.disabled = false;
  alertBox.style.display = "block";
  alertBox.innerHTML = `Você tem <strong>${myProperties.length}</strong> imóvel(is) na sua lista. Envie para um corretor e receba um atendimento exclusivo.`;
}

// Puxa os dados do servidor
async function loadData() {
  try {
    // Pega todos os imóveis publicados
    const res = await fetch("/api/imoveis");
    const data = await res.json();
    allProperties = data.items || [];
    
    // Atualiza a tela
    renderWishlist();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Não foi possível carregar seus favoritos. Tente novamente.</div>`;
  }
}

// Ação do Botão de WhatsApp
btnWhatsapp.addEventListener("click", () => {
  const myProperties = allProperties.filter(p => favoriteIds.includes(p.id));
  
  // Monta a mensagem
  let msg = `Olá, equipe R&D Prime! Meu nome é [Seu Nome] e acabei de montar minha lista de favoritos no site.\n\n`;
  msg += `Gostaria de mais informações sobre os seguintes imóveis:\n\n`;
  
  myProperties.forEach((p, index) => {
    const ref = p.codigo || p.id.slice(0, 10).toUpperCase();
    msg += `*${index + 1}. ${p.titulo}*\n`;
    msg += `Código: ${ref}\n`;
    msg += `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(p.preco || 0)}\n`;
    msg += `Link: https://dayimobiliaria.onrender.com/detalhes.html?id=${p.id}\n\n`;
  });
  
  msg += `Aguardo o contato de vocês!`;

  // Redireciona para o WhatsApp (substitua o número pelo da sua imobiliária, ex: 5511999999999)
  const phone = "5511999999999"; // Coloque o número da R&D Prime aqui
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  
  window.open(url, "_blank");
});

// Login e Logout
$("#btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("/login.html");
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }
  $("#client-welcome").textContent = `Olá! Bem-vindo(a) à sua área exclusiva.`;
  loadData();
});