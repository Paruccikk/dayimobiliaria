import { auth } from "./firebase-client.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let user = null, map = null, marker = null, circle = null, properties = [], waPollTimer = null;

function feedback(text) { $("#campaign-feedback").textContent = text || ""; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function money(value) {
  return value == null ? "Preço sob consulta" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(value));
}
async function api(url, options = {}) {
  if (!user) throw new Error("Sessão administrativa necessária.");
  const token = await user.getIdToken();
  const response = await fetch(url,{...options,headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,...(options.headers||{})}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro HTTP "+response.status);
  return data;
}

function fixLeafletIcons() {
  if (!window.L || !L.Icon || !L.Icon.Default) return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
  });
}
function initMap() {
  if (!window.L || map) return;
  fixLeafletIcons();
  map = L.map("campaign-map",{preferCanvas:true}).setView([-23.686,-46.623],12);
  const tiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",{
    maxZoom:19,attribution:"Tiles © Esri"
  }).addTo(map);
  let fallbackUsed = false;
  tiles.on("tileerror",() => {
    if (fallbackUsed || !map) return;
    fallbackUsed = true;
    if (map.hasLayer(tiles)) map.removeLayer(tiles);
    L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",{
      maxZoom:19,attribution:"Tiles © Esri"
    }).addTo(map);
  });
  map.on("click",event => setCenter(event.latlng.lat,event.latlng.lng));
  const element=$("#campaign-map");
  if (window.ResizeObserver && element) new ResizeObserver(() => map && map.invalidateSize()).observe(element);
  window.addEventListener("resize",() => map && map.invalidateSize());
  setTimeout(() => map && map.invalidateSize(),80);
  setTimeout(() => map && map.invalidateSize(),350);
}
function setCenter(lat,lng,pan=true) {
  if (!map) return;
  const position=[lat,lng], radius=Number($("#radius").value);
  if (!marker) {
    marker=L.marker(position,{draggable:true}).addTo(map);
    marker.on("drag",event => { if(circle) circle.setLatLng(event.target.getLatLng()); });
    marker.on("dragend",event => { const p=event.target.getLatLng(); setCenter(p.lat,p.lng,false); });
  } else marker.setLatLng(position);
  if (!circle) circle=L.circle(position,{radius,color:"#1769c2",fillColor:"#1769c2",fillOpacity:.12,weight:2,interactive:false}).addTo(map);
  else { circle.setLatLng(position); circle.setRadius(radius); }
  if (pan) map.setView(position,Math.max(map.getZoom(),13));
  refreshReach();
}
function radiusChanged() {
  const radius=Number($("#radius").value);
  $("#radius-label").textContent=radius>=1000?(radius/1000).toLocaleString("pt-BR")+" km":radius+" m";
  if(circle) circle.setRadius(radius);
  refreshReach();
}
async function refreshReach() {
  if(!marker){$("#audience-count").textContent="Defina uma região";return;}
  const p=marker.getLatLng(),channels=["push","whatsapp","email"].filter(c=>$("#channel-"+c).checked);
  try {
    const data=await api("/api/admin/alerta-day/alcance?lat="+p.lat+"&lng="+p.lng+"&raio="+$("#radius").value+"&canais="+channels.join(","));
    $("#audience-count").textContent=Number(data.totalElegiveis||0).toLocaleString("pt-BR");
  } catch(error) { $("#audience-count").textContent="Indisponível"; feedback(error.message); }
}
function updatePreview() {
  const property=properties.find(item=>item.id===$("#property").value);
  $("#preview-title").textContent=$("#title").value.trim()||"Alerta Day";
  $("#preview-message").textContent=$("#message").value.trim()||"Confira esta oportunidade imobiliária.";
  const image=$("#preview-image"),photo=property && property.fotos && property.fotos[0];
  if(photo){image.src=new URL(photo,location.origin).href;image.hidden=false;}
  else{image.removeAttribute("src");image.hidden=true;}
}
async function loadData() {
  const data=await api("/api/admin/alerta-day/dados");
  properties=data.imoveis||[];
  [["#stat-location","localizacao"],["#stat-push","push"],["#stat-whatsapp","whatsapp"],["#stat-campaigns","campanhas"]].forEach(([id,key])=>{$(id).textContent=Number(data.resumo && data.resumo[key] || 0).toLocaleString("pt-BR");});
  $("#property").innerHTML='<option value="">Selecione um imóvel publicado</option>'+properties.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.titulo)+" · "+escapeHtml(p.cidade)+" · "+money(p.preco)+"</option>").join("");
  $("#campaign-history").innerHTML=(data.campanhas||[]).slice(0,8).map(c=>'<article><b>'+escapeHtml(c.titulo)+'</b><br><small>'+escapeHtml(c.status||"registrada")+" · "+escapeHtml(c.criadoEm||"")+" · Push "+Number(c.pushEnviados||0)+" · WhatsApp "+Number(c.whatsappEnviados||0)+'</small></article>').join("")||"Nenhuma campanha registrada.";
}
function renderWhatsAppStatus(data={}) {
  const status=data.status||"desconectado",badge=$("#wa-status-badge");
  const labels={conectado:"Conectado",qr:"Aguardando leitura do QR Code",conectando:"Conectando…",desconectado:"Desconectado",erro:"Erro na conexão",indisponivel:"Indisponível"};
  badge.dataset.state=status;
  badge.textContent=labels[status]||status;
  $("#wa-status-message").textContent=data.message||"Sessão WhatsApp Web";
  $("#wa-connect").hidden=status==="conectado";
  $("#wa-disconnect").hidden=!["conectado","qr","conectando"].includes(status);
  if(status==="qr"&&data.qrDataUrl){
    $("#wa-qr-image").src=data.qrDataUrl;
    $("#wa-qr-image").hidden=false;
    $("#wa-qr-placeholder").hidden=true;
    if(!$("#wa-qr-dialog").open) $("#wa-qr-dialog").showModal();
    $("#wa-qr-feedback").textContent="Leia o código pelo menu Aparelhos conectados do WhatsApp.";
  } else if(status==="conectado"){
    $("#wa-qr-image").hidden=true;
    $("#wa-qr-placeholder").hidden=false;
    $("#wa-qr-placeholder").textContent="WhatsApp conectado. A sessão está salva neste servidor.";
    $("#wa-qr-feedback").textContent="Conexão pronta para campanhas.";
    if($("#wa-qr-dialog").open) $("#wa-qr-dialog").close();
  } else {
    $("#wa-qr-image").hidden=true;
    $("#wa-qr-placeholder").hidden=false;
    $("#wa-qr-placeholder").textContent=data.message||"Clique em conectar para gerar um novo QR Code.";
  }
}
async function refreshWhatsAppStatus() {
  if(!user)return;
  try{renderWhatsAppStatus(await api("/api/admin/whatsapp/status"));}
  catch(error){$("#wa-status-message").textContent=error.message;}
}
async function connectWhatsApp() {
  $("#wa-connect").disabled=true;
  $("#wa-qr-dialog").showModal();
  $("#wa-qr-placeholder").textContent="Iniciando WhatsApp Web e preparando o QR Code…";
  $("#wa-qr-image").hidden=true;
  try {
    renderWhatsAppStatus(await api("/api/admin/whatsapp/conectar",{method:"POST",body:"{}"}));
    await refreshWhatsAppStatus();
  } catch(error) { $("#wa-qr-feedback").textContent=error.message; }
  finally { $("#wa-connect").disabled=false; }
}
async function disconnectWhatsApp() {
  if(!confirm("Deseja desconectar e remover a sessão salva do WhatsApp?"))return;
  $("#wa-disconnect").disabled=true;
  try{renderWhatsAppStatus(await api("/api/admin/whatsapp/desconectar",{method:"POST",body:"{}"}));}
  catch(error){feedback(error.message);}
  finally{$("#wa-disconnect").disabled=false;}
}

$("#login-form").addEventListener("submit",async event=>{
  event.preventDefault();
  try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}
  catch(error){$("#login-feedback").textContent=error.message;}
});
$("#logout").addEventListener("click",()=>signOut(auth));
$("#property").addEventListener("change",()=>{
  const property=properties.find(item=>item.id===$("#property").value);
  if(!property)return;
  $("#link").value="/detalhes.html?id="+encodeURIComponent(property.id);
  const lat=Number(property.latitude),lng=Number(property.longitude);
  if(property.latitude!==null&&property.longitude!==null&&Number.isFinite(lat)&&Number.isFinite(lng))setCenter(lat,lng);
  else feedback("Este imóvel não tem coordenadas. Clique no mapa para posicionar o raio.");
  updatePreview();
});
$("#radius").addEventListener("input",radiusChanged);
["push","whatsapp","email"].forEach(channel=>$("#channel-"+channel).addEventListener("change",refreshReach));
["#title","#message"].forEach(selector=>$(selector).addEventListener("input",updatePreview));
$("#preview-button").addEventListener("click",updatePreview);
$("#wa-connect").addEventListener("click",connectWhatsApp);
$("#wa-disconnect").addEventListener("click",disconnectWhatsApp);
$("#send-button").addEventListener("click",()=>{
  const property=properties.find(item=>item.id===$("#property").value),channels=["push","whatsapp","email"].filter(c=>$("#channel-"+c).checked);
  if(!property)return feedback("Selecione um imóvel publicado.");
  if(!marker)return feedback("Defina o centro do raio no mapa.");
  if(!channels.length)return feedback("Selecione ao menos um canal.");
  if(channels.includes("whatsapp")&&$("#wa-status-badge").dataset.state!=="conectado")return feedback("Conecte o WhatsApp pelo QR Code antes de preparar o disparo.");
  $("#confirm-summary").textContent=property.titulo+" · raio "+$("#radius-label").textContent+" · canais "+channels.join(", ")+". O servidor validará novamente os consentimentos.";
  $("#confirm-dialog").showModal();
});
$("#confirm-send").addEventListener("click",async event=>{
  event.preventDefault();
  const property=properties.find(item=>item.id===$("#property").value),center=marker&&marker.getLatLng(),channels=["push","whatsapp","email"].filter(c=>$("#channel-"+c).checked);
  if(!property||!center)return;
  const button=$("#confirm-send");button.disabled=true;
  try{
    const result=await api("/api/admin/alerta-day/disparar",{method:"POST",body:JSON.stringify({imovelId:property.id,titulo:$("#title").value.trim(),mensagem:$("#message").value.trim(),link:$("#link").value.trim(),centro:{lat:center.lat,lng:center.lng},raioMetros:Number($("#radius").value),canais:channels})});
    $("#confirm-dialog").close();
    feedback("Campanha "+result.campaignId+" processada. Elegíveis: "+result.elegiveis+" · Push: "+result.pushEnviados+" · WhatsApp: "+result.whatsappEnviados+" · Falhas: "+result.falhas+".");
    await loadData();
  }catch(error){feedback(error.message);}
  finally{button.disabled=false;}
});

onAuthStateChanged(auth,async current=>{
  user=current;
  if(!current){
    $("#login-screen").hidden=false;$("#app").hidden=true;
    if(waPollTimer)clearInterval(waPollTimer);
    return;
  }
  try{
    const profile=await api("/api/auth/perfil");
    if(profile.perfil && (profile.perfil.papel!=="administrador"||profile.perfil.ativo!==true||profile.perfil.status!=="ativo")){
      await signOut(auth);
      $("#login-feedback").textContent="Acesso exclusivo para administradores ativos.";
      return;
    }
    if(!profile.perfil)throw new Error("Perfil administrativo não encontrado.");
    $("#login-screen").hidden=true;
    $("#app").hidden=false;
    initMap();
    await loadData();
    await refreshWhatsAppStatus();
    if(waPollTimer)clearInterval(waPollTimer);
    waPollTimer=setInterval(()=>void refreshWhatsAppStatus(),2500);
    $("#send-button").disabled=false;
    setTimeout(()=>map&&map.invalidateSize(),100);
    setTimeout(()=>map&&map.invalidateSize(),400);
  }catch(error){
    await signOut(auth);
    $("#login-screen").hidden=false;
    $("#app").hidden=true;
    $("#login-feedback").textContent=error.message;
  }
});
