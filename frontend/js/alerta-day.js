import { auth } from "./firebase-client.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
let user = null, map = null, circle = null, marker = null, properties = [];

function fixLeafletIcons() {
  if (window.L && L.Icon && L.Icon.Default) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }
}

async function api(url, options = {}) {
  if (!user) throw new Error("Entre como administrador.");
  const token = await user.getIdToken();
  const response = await fetch(url, { ...options, headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}`, ...(options.headers||{}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

function message(text) { $("#campaign-feedback").textContent = text; }
function money(v) { return v == null ? "Preço sob consulta" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(v)); }

function initMap() {
  if (!window.L || map) return;
  fixLeafletIcons();

  map = L.map("campaign-map").setView([-23.686, -46.623], 12);

  const osmTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  let fallbackLoaded = false;
  osmTiles.on("tileerror", () => {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    if (map.hasLayer(osmTiles)) map.removeLayer(osmTiles);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }).addTo(map);
  });

  map.on("click", e => setCenter(e.latlng.lat, e.latlng.lng));

  setTimeout(() => map?.invalidateSize(), 60);
  setTimeout(() => map?.invalidateSize(), 300);
  window.addEventListener("resize", () => map?.invalidateSize());
  if (window.ResizeObserver) {
    const el = document.getElementById("campaign-map");
    if (el) new ResizeObserver(() => map?.invalidateSize()).observe(el);
  }
}

function setCenter(lat, lng, pan = true) {
  if (!map) return;
  const radius = Number($("#radius").value);

  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on("drag", e => {
      const pos = e.target.getLatLng();
      if (circle) circle.setLatLng(pos);
    });
    marker.on("dragend", e => {
      const pos = e.target.getLatLng();
      setCenter(pos.lat, pos.lng, false);
    });
  } else {
    marker.setLatLng([lat, lng]);
  }

  if (!circle) {
    circle = L.circle([lat, lng], {
      radius,
      color: "#1769c2",
      fillColor: "#1769c2",
      fillOpacity: 0.12,
      weight: 2,
      interactive: false
    }).addTo(map);
  } else {
    circle.setLatLng([lat, lng]);
    circle.setRadius(radius);
  }

  if (pan) {
    map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }
  refreshReach();
}

function drawCircle() {
  const r = Number($("#radius").value);
  $("#radius-label").textContent = r >= 1000 ? (r / 1000).toLocaleString("pt-BR") + " km" : r + " m";
  if (circle) circle.setRadius(r);
  refreshReach();
}

async function searchLocation(query) {
  if (!query || !query.trim()) return;
  message("Buscando localização no mapa...");
  try {
    const data = await api(`/api/admin/alerta-day/geocode?q=${encodeURIComponent(query.trim())}`);
    if (data.lat && data.lng) {
      setCenter(data.lat, data.lng);
      message(`Localização encontrada: ${data.display_name?.split(",").slice(0, 3).join(",") || "ponto definido"}`);
    }
  } catch (err) {
    message(err.message || "Localização não encontrada.");
  }
}

async function refreshReach() {
  if (!marker) { $("#audience-count").textContent = "Selecione o imóvel"; return; }
  const p = marker.getLatLng(), radius = Number($("#radius").value);
  try {
    const channels = [];
    if ($("#channel-push").checked) channels.push("push");
    if ($("#channel-whatsapp").checked) channels.push("whatsapp");
    const data = await api(`/api/admin/alerta-day/alcance?lat=${p.lat}&lng=${p.lng}&raio=${radius}&canais=${channels.join(",")}`);
    $("#audience-count").textContent = Number(data.totalElegiveis || 0).toLocaleString("pt-BR");
  } catch (e) {
    $("#audience-count").textContent = "indisponível";
    message(e.message);
  }
}

async function loadData() {
  const data = await api("/api/admin/alerta-day/dados");
  properties = data.imoveis || [];
  $("#stat-location").textContent = Number(data.resumo?.localizacao || 0).toLocaleString("pt-BR");
  $("#stat-push").textContent = Number(data.resumo?.push || 0).toLocaleString("pt-BR");
  $("#stat-whatsapp").textContent = Number(data.resumo?.whatsapp || 0).toLocaleString("pt-BR");
  $("#stat-campaigns").textContent = Number(data.resumo?.campanhas || 0).toLocaleString("pt-BR");
  $("#property").innerHTML = '<option value="">Selecione um imóvel publicado</option>' + properties.map(p => `<option value="${p.id}">${escapeHtml(p.titulo)} · ${escapeHtml(p.cidade||"")} · ${money(p.preco)}</option>`).join("");
  $("#campaign-history").innerHTML = (data.campanhas || []).slice(0,6).map(c => `<article><b>${escapeHtml(c.titulo)}</b><br><small>${escapeHtml(c.status||"registrada")} · ${escapeHtml(c.criadoEm||"")}</small></article>`).join("") || "Nenhuma campanha registrada.";
}

function escapeHtml(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function selectedProperty() { return properties.find(p => p.id === $("#property").value); }

function updatePreview() {
  $("#preview-title").textContent=$("#title").value.trim()||"Alerta Day";
  $("#preview-message").textContent=$("#message").value.trim()||"Confira esta oportunidade imobiliária.";
  const photo=selectedProperty()?.fotos?.[0];
  const image=$("#preview-image");
  if(photo){image.src=new URL(photo,window.location.origin).href;image.hidden=false;}else{image.removeAttribute("src");image.hidden=true;}
}

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
  } catch(err) {
    $("#login-feedback").textContent = err.message;
  }
});

$("#logout").addEventListener("click", () => signOut(auth));

$("#property").addEventListener("change", () => {
  const p = selectedProperty();
  const geocodeBtn = $("#property-geocode-btn");
  if (!p) {
    geocodeBtn.style.display = "none";
    return;
  }
  $("#link").value = `/detalhes.html?id=${encodeURIComponent(p.id)}`;

  const hasCoords = p.latitude !== null && p.latitude !== "" && p.latitude !== undefined &&
                    p.longitude !== null && p.longitude !== "" && p.longitude !== undefined &&
                    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));

  const addressQuery = [p.bairro, p.cidade, p.estado].filter(Boolean).join(", ");

  if (hasCoords) {
    setCenter(Number(p.latitude), Number(p.longitude));
    geocodeBtn.style.display = "none";
    message("Área centralizada nas coordenadas do imóvel.");
  } else if (addressQuery) {
    geocodeBtn.style.display = "inline-block";
    geocodeBtn.textContent = `Localizar por ${p.bairro || p.cidade}`;
    geocodeBtn.onclick = () => searchLocation(addressQuery);
    message(`Imóvel sem coordenadas salvas. Clique em "${geocodeBtn.textContent}", use a busca acima ou clique no mapa.`);
  } else {
    geocodeBtn.style.display = "none";
    message("Este imóvel não possui coordenadas nem endereço salvo. Use a busca ou clique no mapa para posicionar.");
  }
  updatePreview();
});

$("#map-search-btn").addEventListener("click", () => searchLocation($("#map-search-input").value));
$("#map-search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchLocation($("#map-search-input").value);
  }
});

$("#radius").addEventListener("input", drawCircle);
$("#channel-push").addEventListener("change", refreshReach);
$("#channel-whatsapp").addEventListener("change", refreshReach);
$("#title").addEventListener("input", updatePreview);
$("#message").addEventListener("input", updatePreview);
$("#preview-button").addEventListener("click", updatePreview);

$("#send-button").addEventListener("click", () => {
  const p = selectedProperty(), channels = [];
  if ($("#channel-push").checked) channels.push("Push");
  if ($("#channel-whatsapp").checked) channels.push("WhatsApp");
  if (!p) return message("Selecione um imóvel.");
  if (!marker) return message("Defina o centro do raio no mapa.");
  if (!channels.length) return message("Selecione ao menos um canal.");
  $("#confirm-summary").textContent = `${p.titulo} · raio de ${$("#radius-label").textContent} · canais: ${channels.join(" + ")}. O servidor fará a validação final de consentimento e destinatários.`;
  $("#confirm-dialog").showModal();
});

$("#confirm-send").addEventListener("click", async e => {
  e.preventDefault();
  const p = selectedProperty(), center = marker?.getLatLng();
  if (!p || !center) return;
  const channels = [];
  if ($("#channel-push").checked) channels.push("push");
  if ($("#channel-whatsapp").checked) channels.push("whatsapp");
  const button = $("#confirm-send");
  button.disabled = true;
  try {
    const result = await api("/api/admin/alerta-day/disparar", {
      method: "POST",
      body: JSON.stringify({
        imovelId: p.id,
        titulo: $("#title").value.trim(),
        mensagem: $("#message").value.trim(),
        link: $("#link").value.trim(),
        centro: { lat: center.lat, lng: center.lng },
        raioMetros: Number($("#radius").value),
        canais: channels
      })
    });
    $("#confirm-dialog").close();
    message(`Campanha processada. Push: ${result.pushEnviados||0}; WhatsApp: ${result.whatsappEnviados||0}. Consulte o histórico para detalhes.`);
    await loadData();
  } catch (err) {
    message(err.message);
  } finally {
    button.disabled = false;
  }
});

onAuthStateChanged(auth, async current => {
  user = current;
  $("#login-screen").hidden = !!current;
  $("#app").hidden = !current;
  if (!current) return;
  try {
    initMap();
    map?.invalidateSize();
    await loadData();
    $("#send-button").disabled = false;
    setTimeout(() => map?.invalidateSize(), 100);
  } catch (err) {
    message(err.message);
  }
});
