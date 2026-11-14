import { auth } from "./firebase-client.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
let user = null, map = null, circle = null, marker = null, properties = [];

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
  map = L.map("campaign-map").setView([-23.686, -46.623], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(map);
  map.on("click", e => setCenter(e.latlng.lat,e.latlng.lng));
}
function setCenter(lat,lng) {
  if (!map) return;
  if (marker) marker.setLatLng([lat,lng]); else marker = L.marker([lat,lng]).addTo(map);
  const radius = Number($("#radius").value);
  if (circle) circle.setLatLng([lat,lng]).setRadius(radius); else circle = L.circle([lat,lng],{radius,color:"#1769c2",fillColor:"#1769c2",fillOpacity:.12,weight:2}).addTo(map);
  map.setView([lat,lng], Math.max(map.getZoom(),13));
  refreshReach();
}
function drawCircle() {
  $("#radius-label").textContent = Number($("#radius").value) >= 1000 ? (Number($("#radius").value)/1000).toLocaleString("pt-BR")+" km" : $("#radius").value+" m";
  if (circle) circle.setRadius(Number($("#radius").value));
  refreshReach();
}
async function refreshReach() {
  if (!marker) { $("#audience-count").textContent = "Selecione o imóvel"; return; }
  const p = marker.getLatLng(), radius = Number($("#radius").value);
  try {
    const channels = []; if ($("#channel-push").checked) channels.push("push"); if ($("#channel-whatsapp").checked) channels.push("whatsapp");
    const data = await api(`/api/admin/alerta-day/alcance?lat=${p.lat}&lng=${p.lng}&raio=${radius}&canais=${channels.join(",")}`);
    $("#audience-count").textContent = Number(data.totalElegiveis || 0).toLocaleString("pt-BR");
  } catch (e) { $("#audience-count").textContent = "indisponível"; message(e.message); }
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
function updatePreview() { $("#preview-title").textContent=$("#title").value.trim()||"Alerta Day"; $("#preview-message").textContent=$("#message").value.trim()||"Confira esta oportunidade imobiliária."; const photo=selectedProperty()?.fotos?.[0]; const image=$("#preview-image"); if(photo){image.src=new URL(photo,window.location.origin).href;image.hidden=false;}else{image.removeAttribute("src");image.hidden=true;} }
$("#login-form").addEventListener("submit", async e => { e.preventDefault(); try { await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value); } catch(err) { $("#login-feedback").textContent=err.message; } });
$("#logout").addEventListener("click",()=>signOut(auth));
$("#property").addEventListener("change",()=>{ const p=selectedProperty(); if(!p)return; $("#link").value=`/detalhes.html?id=${encodeURIComponent(p.id)}`; if(p.latitude!==null&&p.latitude!==""&&p.latitude!==undefined&&p.longitude!==null&&p.longitude!==""&&p.longitude!==undefined&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)))setCenter(Number(p.latitude),Number(p.longitude)); else message("Este imóvel ainda não possui coordenadas. Clique no mapa para posicionar o círculo manualmente."); updatePreview(); });
$("#radius").addEventListener("input",drawCircle);
$("#channel-push").addEventListener("change",refreshReach); $("#channel-whatsapp").addEventListener("change",refreshReach);
$("#title").addEventListener("input",updatePreview); $("#message").addEventListener("input",updatePreview);
$("#preview-button").addEventListener("click",updatePreview);
$("#send-button").addEventListener("click",()=>{ const p=selectedProperty(), channels=[]; if($("#channel-push").checked)channels.push("Push"); if($("#channel-whatsapp").checked)channels.push("WhatsApp"); if(!p)return message("Selecione um imóvel."); if(!marker)return message("Defina o centro do raio no mapa."); if(!channels.length)return message("Selecione ao menos um canal."); $("#confirm-summary").textContent=`${p.titulo} · raio de ${$("#radius-label").textContent} · canais: ${channels.join(" + ")}. O servidor fará a validação final de consentimento e destinatários.`; $("#confirm-dialog").showModal(); });
$("#confirm-send").addEventListener("click",async e=>{ e.preventDefault(); const p=selectedProperty(), center=marker?.getLatLng(); if(!p||!center)return; const channels=[]; if($("#channel-push").checked)channels.push("push"); if($("#channel-whatsapp").checked)channels.push("whatsapp"); const button=$("#confirm-send"); button.disabled=true; try { const result=await api("/api/admin/alerta-day/disparar",{method:"POST",body:JSON.stringify({imovelId:p.id,titulo:$("#title").value.trim(),mensagem:$("#message").value.trim(),link:$("#link").value.trim(),centro:{lat:center.lat,lng:center.lng},raioMetros:Number($("#radius").value),canais:channels})}); $("#confirm-dialog").close(); message(`Campanha processada. Push: ${result.pushEnviados||0}; WhatsApp: ${result.whatsappEnviados||0}. Consulte o histórico para detalhes.`); await loadData(); } catch(err) { message(err.message); } finally { button.disabled=false; } });
onAuthStateChanged(auth,async current=>{ user=current; $("#login-screen").hidden=!!current; $("#app").hidden=!current; if(!current)return; try { initMap(); await loadData(); $("#send-button").disabled=false; setTimeout(()=>map?.invalidateSize(),150); } catch(err) { message(err.message); } });
