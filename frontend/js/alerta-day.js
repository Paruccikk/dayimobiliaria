import { auth } from "./firebase-client.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
let user = null, map = null, circle = null, marker = null, properties = [];
let activeCampaignRequestId = null;

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

  const esriTiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, USGS, NPS"
  }).addTo(map);

  let fallbackLoaded = false;
  esriTiles.on("tileerror", () => {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    if (map.hasLayer(esriTiles)) map.removeLayer(esriTiles);
    L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
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
    if ($("#channel-email").checked) channels.push("email");
    const data = await api(`/api/admin/alerta-day/alcance?lat=${p.lat}&lng=${p.lng}&raio=${radius}&canais=${channels.join(",")}`);
    const elegiveis = Number(data.totalElegiveis || 0);
    const totalLoc = Number(data.totalLocalizacao || 0);
    $("#audience-count").textContent = elegiveis.toLocaleString("pt-BR");
    const detail = $("#audience-detail");
    if (detail) {
      if (elegiveis === 0 && totalLoc === 0) {
        detail.textContent = "Nenhum visitante cadastrado nesta área";
      } else if (elegiveis === 0 && totalLoc > 0) {
        detail.textContent = `${totalLoc} pessoa(s) com localização no raio, mas sem canal ativo selecionado`;
      } else {
        const pushCount = Number(data.pushElegiveis || 0);
        const whatsappCount = Number(data.whatsappElegiveis || 0);
        const emailCount = Number(data.emailElegiveis || 0);
        detail.textContent = `${totalLoc} com localização · Push: ${pushCount} · WhatsApp: ${whatsappCount} · E-mail: ${emailCount}`;
      }
    }
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
  $("#stat-email").textContent = Number(data.resumo?.email || 0).toLocaleString("pt-BR");
  $("#stat-campaigns").textContent = Number(data.resumo?.campanhas || 0).toLocaleString("pt-BR");
  $("#property").innerHTML = '<option value="">Selecione um imóvel publicado</option>' + properties.map(p => `<option value="${p.id}">${escapeHtml(p.titulo)} · ${escapeHtml(p.cidade||"")} · ${money(p.preco)}</option>`).join("");
  $("#campaign-history").innerHTML = (data.campanhas || []).slice(0,6).map(c => `<article><b>${escapeHtml(c.titulo)}</b><br><small>${escapeHtml(c.status||"registrada")} · ${escapeHtml(c.criadoEm||"")}</small></article>`).join("") || "Nenhuma campanha registrada.";
  await ensureWhatsAppConnection(data.whatsappStatus || null);
}

let waPollTimer = null;

function updateWhatsAppUI(status) {
  const badge = $("#wa-status-badge");
  const phoneLabel = $("#wa-phone-label");
  const btnConnect = $("#btn-wa-connect");
  const btnDisconnect = $("#btn-wa-disconnect");
  const qrImg = $("#wa-qr-img");
  const qrLoading = $("#wa-qr-loading");
  const qrStatus = $("#wa-qr-status");
  const qrState = $("#wa-qr-state");
  const connectedState = $("#wa-connected-state");
  if (!badge || !status) return;

  const showQr = () => {
    if (qrState) qrState.hidden = false;
    if (connectedState) connectedState.hidden = true;
    if (btnConnect) btnConnect.hidden = false;
    if (btnDisconnect) btnDisconnect.hidden = true;
  };

  if (status.status === "connected") {
    badge.textContent = "Conectado";
    badge.dataset.state = "conectado";
    if (phoneLabel) phoneLabel.textContent = status.connectedPhone ? "Número: +" + status.connectedPhone : "Número conectado";
    if (qrState) qrState.hidden = true;
    if (connectedState) connectedState.hidden = false;
    if (btnConnect) btnConnect.hidden = true;
    if (btnDisconnect) btnDisconnect.hidden = false;
    stopWaPolling();
    return;
  }

  showQr();
  if (status.status === "qr_ready" && status.qrCode) {
    badge.textContent = "Leia o QR Code";
    badge.dataset.state = "qr";
    if (qrImg) { qrImg.src = status.qrCode; qrImg.hidden = false; }
    if (qrLoading) qrLoading.hidden = true;
    if (qrStatus) qrStatus.textContent = "QR Code pronto. Leia com o WhatsApp do celular.";
    if (btnConnect) btnConnect.textContent = "Gerar novo QR Code";
  } else if (status.status === "connecting") {
    badge.textContent = "Conectando";
    badge.dataset.state = "conectando";
    if (qrImg) qrImg.hidden = true;
    if (qrLoading) { qrLoading.hidden = false; qrLoading.textContent = "Solicitando QR Code ao WhatsApp..."; }
    if (qrStatus) qrStatus.textContent = "A conexão está sendo iniciada. Esta área será atualizada automaticamente.";
  } else if (status.status === "error") {
    badge.textContent = "Falha na conexão";
    badge.dataset.state = "erro";
    if (qrImg) qrImg.hidden = true;
    if (qrLoading) { qrLoading.hidden = false; qrLoading.textContent = status.error || "Não foi possível gerar o QR Code."; }
    if (qrStatus) qrStatus.textContent = "Verifique os logs do servidor e tente novamente.";
    if (btnConnect) btnConnect.textContent = "Tentar novamente";
  } else {
    badge.textContent = "Desconectado";
    badge.dataset.state = "desconectado";
    if (qrImg) qrImg.hidden = true;
    if (qrLoading) { qrLoading.hidden = false; qrLoading.textContent = "Clique em Gerar QR Code para iniciar a conexão."; }
    if (qrStatus) qrStatus.textContent = "O QR Code aparecerá aqui quando o WhatsApp iniciar a conexão.";
    if (btnConnect) btnConnect.textContent = "Gerar QR Code";
  }
}

async function checkWhatsAppStatus() {
  try {
    const data = await api("/api/admin/whatsapp/status");
    updateWhatsAppUI(data);
    return data;
  } catch (err) {
    return { status: "disconnected" };
  }
}

function startWaPolling() {
  stopWaPolling();
  waPollTimer = setInterval(async () => {
    const status = await checkWhatsAppStatus();
    if (status.status === "connected" || status.status === "error") stopWaPolling();
  }, 2500);
}

function stopWaPolling() {
  if (waPollTimer) {
    clearInterval(waPollTimer);
    waPollTimer = null;
  }
}

async function ensureWhatsAppConnection(initialStatus = null) {
  const status = initialStatus || await checkWhatsAppStatus();
  updateWhatsAppUI(status);
  if (status.status === "connected" || status.status === "connecting" || status.status === "qr_ready") {
    if (status.status !== "connected") startWaPolling();
    return;
  }
  if (status.status === "error") return;

  try {
    const started = await api("/api/admin/whatsapp/connect", { method: "POST" });
    updateWhatsAppUI(started);
    if (started.status !== "connected" && started.status !== "error") startWaPolling();
  } catch (err) {
    const feedback = $("#wa-qr-feedback");
    if (feedback) feedback.textContent = "Falha ao iniciar: " + err.message;
  }
}

$("#btn-wa-connect")?.addEventListener("click", async () => {
  const button = $("#btn-wa-connect");
  if (button) button.disabled = true;
  const loading = $("#wa-qr-loading");
  const image = $("#wa-qr-img");
  if (loading) { loading.hidden = false; loading.textContent = "Iniciando conexão e solicitando QR Code..."; }
  if (image) image.hidden = true;
  try {
    const data = await api("/api/admin/whatsapp/connect", { method: "POST" });
    updateWhatsAppUI(data);
    if (data.status !== "connected" && data.status !== "error") startWaPolling();
  } catch (err) {
    const feedback = $("#wa-qr-feedback");
    if (feedback) feedback.textContent = "Falha ao iniciar WhatsApp: " + err.message;
  } finally {
    if (button) button.disabled = false;
  }
});

$("#btn-wa-disconnect")?.addEventListener("click", async () => {
  if (!confirm("Deseja desconectar o WhatsApp do painel?")) return;
  try {
    const data = await api("/api/admin/whatsapp/disconnect", { method: "POST" });
    updateWhatsAppUI(data);
    message("WhatsApp desconectado.");
  } catch (err) {
    message(err.message);
  }
});

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

$("#map-gps-btn")?.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    return message("Seu navegador não suporta geolocalização.");
  }
  message("Obtendo sua localização via GPS...");
  navigator.geolocation.getCurrentPosition(
    pos => {
      setCenter(pos.coords.latitude, pos.coords.longitude);
      message("Mapa centralizado na sua localização atual (GPS).");
    },
    err => {
      if (err.code === 1) {
        message("Permissão de GPS negada no navegador. Permita o acesso nas configurações do site.");
      } else {
        message("Não foi possível obter sua localização: " + err.message);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

$("#btn-add-test-visitor")?.addEventListener("click", async () => {
  if (!marker) return message("Posicione primeiro o círculo no mapa.");
  const p = marker.getLatLng();
  const btn = $("#btn-add-test-visitor");
  btn.disabled = true;
  message("Registrando sua localização como destinatário de teste...");
  try {
    await api("/api/admin/alerta-day/test-visitor", {
      method: "POST",
      body: JSON.stringify({ latitude: p.lat, longitude: p.lng })
    });
    message("Destinatário de teste cadastrado nesta posição com sucesso!");
    await loadData();
    await refreshReach();
  } catch (err) {
    message(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#radius").addEventListener("input", drawCircle);
$("#channel-push").addEventListener("change", refreshReach);
$("#channel-whatsapp").addEventListener("change", refreshReach);
$("#channel-email").addEventListener("change", refreshReach);
$("#title").addEventListener("input", updatePreview);
$("#message").addEventListener("input", updatePreview);
$("#preview-button").addEventListener("click", updatePreview);

$("#send-button").addEventListener("click", () => {
  const p = selectedProperty(), channels = [];
  if ($("#channel-push").checked) channels.push("Push");
  if ($("#channel-whatsapp").checked) channels.push("WhatsApp");
  if ($("#channel-email").checked) channels.push("E-mail");
  if (!p) return message("Selecione um imóvel.");
  if (!marker) return message("Defina o centro do raio no mapa.");
  if (!channels.length) return message("Selecione ao menos um canal.");
  activeCampaignRequestId = crypto.randomUUID();
  $("#confirm-summary").textContent = `${p.titulo} · raio de ${$("#radius-label").textContent} · canais: ${channels.join(" + ")}. O servidor fará a validação final de consentimento e destinatários.`;
  const confirmFb = $("#confirm-feedback");
  if (confirmFb) { confirmFb.hidden = true; confirmFb.textContent = ""; }
  $("#confirm-dialog").showModal();
});

$("#confirm-send").addEventListener("click", async e => {
  e.preventDefault();
  const p = selectedProperty(), center = marker?.getLatLng();
  if (!p || !center) return;
  const channels = [];
  if ($("#channel-push").checked) channels.push("push");
  if ($("#channel-whatsapp").checked) channels.push("whatsapp");
  if ($("#channel-email").checked) channels.push("email");
  const button = $("#confirm-send");
  const confirmFb = $("#confirm-feedback");
  if (confirmFb) confirmFb.hidden = true;
  button.disabled = true;
  try {
    const result = await api("/api/admin/alerta-day/disparar", {
      method: "POST",
      body: JSON.stringify({
        imovelId: p.id,
        requestId: activeCampaignRequestId || crypto.randomUUID(),
        titulo: $("#title").value.trim(),
        mensagem: $("#message").value.trim(),
        link: $("#link").value.trim(),
        centro: { lat: center.lat, lng: center.lng },
        raioMetros: Number($("#radius").value),
        canais: channels
      })
    });
    activeCampaignRequestId = null;
    $("#confirm-dialog").close();
    message(`Campanha processada. Push: ${result.pushEnviados||0}; WhatsApp: ${result.whatsappEnviados||0}; E-mail: ${result.emailEnviados||0}.`);
    await loadData();
  } catch (err) {
    if (confirmFb) {
      confirmFb.textContent = err.message;
      confirmFb.hidden = false;
    }
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
