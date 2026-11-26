import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;
let currentProfile = null;
let loading = false;
let brokerProperties = [];
let brokerSearchTerm = "";
let brokerLeads = [];
let brokerLeadSearchTerm = "";

// Utilitários
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const money = (val) => val == null || val === "" ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(val));
const formatDate = (val) => val ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(val)) : "—";

function statusLabel(status) {
  const labels = { 
    publicado: "Publicado", aguardando_aprovacao: "Pendente", inativo: "Inativo", novo: "Novo",
    pendente: "Pendente", confirmado: "Confirmado", recusado: "Recusado", concluido: "Concluído" 
  };
  return labels[status] || status || "—";
}
function statusPill(status) {
  let cls = "pill";
  if (["publicado", "confirmado", "concluido"].includes(status)) cls = "pill pill-green";
  else if (["aguardando_aprovacao", "pendente", "novo"].includes(status)) cls = "pill pill-gold";
  return `<span class="${cls}">${escapeHtml(statusLabel(status))}</span>`;
}

// API Helper
async function api(url, options = {}) {
  if (!currentUser) throw new Error("Sessão expirada.");
  const token = await currentUser.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição.");
  return data;
}

// Ação de atualizar Agendamento
window.updateAgenda = async function(id, status, btn) {
  btn.disabled = true;
  try {
    await api(`/api/agendamentos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadDashboard();
  } catch (e) {
    alert("Erro ao atualizar agendamento: " + e.message);
    btn.disabled = false;
  }
};

function renderBrokerProperties() {
  const tbody = $("#imoveis-lista");
  const norm = value => String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = norm(brokerSearchTerm.trim());
  const filtered = query ? brokerProperties.filter(item => norm([item.titulo,item.id,item.cidade,item.estado,item.bairro,item.regiao,item.finalidade,item.status].join(" ")).includes(query)) : brokerProperties;
  if (!brokerProperties.length) { tbody.innerHTML = '<tr><td colspan="5">Você ainda não tem imóveis cadastrados.</td></tr>'; return; }
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="5">Nenhum imóvel encontrado para essa busca.</td></tr>'; return; }
  tbody.innerHTML = filtered.map(item => `<tr data-property-id="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.titulo)}</strong><div class="dash-subtitle">${escapeHtml(item.bairro||"")} ${item.cidade?`- ${escapeHtml(item.cidade)}`:""}</div></td><td>${escapeHtml(item.finalidade)}</td><td>${money(item.preco)}</td><td>${statusPill(item.status)}</td><td><a href="/detalhes.html?id=${encodeURIComponent(item.id)}" class="small-btn light" target="_blank">Ver no site ↗</a> <label class="small-btn light" style="display:inline-block;cursor:pointer">Adicionar fotos<input class="broker-add-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><label style="display:inline-flex;align-items:center;gap:5px;margin-left:6px;font-size:12px"><input class="broker-mcmv" type="checkbox" ${item.minhaCasaMinhaVida===true?"checked":""}> MCMV</label></td></tr>`).join("");
  tbody.querySelectorAll(".broker-add-photos").forEach(input=>input.addEventListener("change",async()=>{
    const id=input.closest("tr")?.dataset.propertyId, files=Array.from(input.files||[]); if(!id||!files.length)return;
    if(files.length>40||files.some(file=>file.size>50*1024*1024)){alert("Selecione até 40 imagens, com no máximo 50 MB cada.");input.value="";return;}
    input.disabled=true;
    try{const token=await currentUser.getIdToken();for(const file of files){const form=new FormData();form.append("arquivos",file);const response=await fetch("/api/admin/imoveis/"+encodeURIComponent(id)+"/arquivos",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Falha ao enviar foto.");}alert("Fotos adicionadas ao imóvel.");await loadDashboard();}
    catch(error){alert(error.message);}finally{input.disabled=false;input.value="";}
  }));
  tbody.querySelectorAll(".broker-mcmv").forEach(input=>input.addEventListener("change",async()=>{
    const id=input.closest("tr")?.dataset.propertyId, checked=input.checked;input.disabled=true;
    try{await api("/api/admin/imoveis/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({minhaCasaMinhaVida:checked})});const item=brokerProperties.find(p=>p.id===id);if(item)item.minhaCasaMinhaVida=checked;}
    catch(error){input.checked=!checked;alert(error.message);}finally{input.disabled=false;}
  }));
}

function renderBrokerLeads() {
  const tbody=$("#leads-lista"), norm=value=>String(value??"").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const q=norm(brokerLeadSearchTerm.trim()), filtered=q?brokerLeads.filter(x=>norm([x.nome,x.telefone,x.email,x.imovelId,x.mensagem,x.status].join(" ")).includes(q)):brokerLeads.slice(0,100);
  if(!brokerLeads.length){tbody.innerHTML='<tr><td colspan="4">Nenhum lead recebido ainda.</td></tr>';return;}
  if(!filtered.length){tbody.innerHTML='<tr><td colspan="4">Nenhum lead encontrado para essa busca.</td></tr>';return;}
  tbody.innerHTML=filtered.map(x=>`<tr><td><strong>${escapeHtml(x.nome)}</strong><div class="dash-subtitle">${escapeHtml(x.mensagem||"")}</div></td><td><a href="https://wa.me/55${String(x.telefone||"").replace(/\D/g,"")}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.telefone||"—")} ↗</a></td><td>${escapeHtml(x.imovelId||"—")}</td><td>${formatDate(x.criadoEm)}</td></tr>`).join("");
}

// Carregar Dados
async function loadDashboard() {
  if (loading) return;
  loading = true;
  $("#dash-feedback").textContent = "Atualizando carteira…";

  try {
    const profileData = await api("/api/auth/perfil");
    currentProfile = profileData.perfil;
    
    if (!["corretor", "administrador"].includes(currentProfile?.papel)) {
      throw new Error("Acesso restrito a corretores.");
    }

    $("#corretor-welcome").textContent = `Conectado como ${currentUser.email} · ${currentProfile.papel}`;

    const data = await api("/api/corretor/dashboard");
    
    const allImoveis = data.imoveis || [];
    const myImoveis = currentProfile.papel === "administrador" 
      ? allImoveis 
      : allImoveis.filter(i => i.responsavelUid === currentUser.uid || i.responsavelTipo === "todos");

    $("#stat-total").textContent = myImoveis.length;
    $("#stat-publicados").textContent = myImoveis.filter(i => i.status === "publicado").length;
    $("#stat-pendentes").textContent = myImoveis.filter(i => i.status === "aguardando_aprovacao").length;
    
    const leads = data.leads || [];
    brokerLeads = leads;
    $("#stat-leads").textContent = leads.length;

    // --- RENDERIZAR TABELA DE IMÓVEIS ---
    brokerProperties = myImoveis;
    renderBrokerProperties();

    // --- RENDERIZAR AGENDAMENTOS ---
    const resAgenda = await api("/api/agendamentos");
    const agendamentos = resAgenda.items || [];
    const tbodyAgenda = $("#agenda-lista");
    
    if (agendamentos.length === 0) {
      tbodyAgenda.innerHTML = '<tr><td colspan="6">Nenhuma visita agendada no momento.</td></tr>';
    } else {
      tbodyAgenda.innerHTML = agendamentos.map(ag => {
        // Formata a data AAAA-MM-DD para DD/MM/AAAA
        const dataF = ag.data.split('-').reverse().join('/');
        return `
        <tr>
          <td>
            <strong>${escapeHtml(ag.clienteNome)}</strong>
            <div class="dash-subtitle">${escapeHtml(ag.clienteTelefone)}</div>
          </td>
          <td>${escapeHtml(ag.imovelId.slice(0, 8))}...</td>
          <td>${dataF} · ${escapeHtml(ag.turno)}</td>
          <td>${escapeHtml(ag.tipo)}</td>
          <td>${statusPill(ag.status)}</td>
          <td>
            ${ag.status === 'pendente' ? `
              <button class="small-btn gold" data-agenda-action="confirmado" data-agenda-id="${escapeHtml(ag.id)}">Confirmar</button>
              <button class="small-btn light" data-agenda-action="recusado" data-agenda-id="${escapeHtml(ag.id)}">Recusar</button>
            ` : '<span class="dash-subtitle">Finalizado</span>'}
          </td>
        </tr>
      `}).join("");
    }

    // --- RENDERIZAR TABELA DE LEADS ---
    renderBrokerLeads();

    $("#dash-feedback").textContent = "Carteira atualizada com sucesso.";
    $("#dash-feedback").style.color = "var(--text-soft)";

  } catch (err) {
    $("#dash-feedback").textContent = err.message;
    $("#dash-feedback").style.color = "#f06ca8";
  } finally {
    loading = false;
  }
}

// Cadastro de Imóvel
$("#property-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#btn-submit");
  const feedback = $("#form-feedback");
  
  btn.disabled = true;
  btn.textContent = "Enviando…";
  feedback.textContent = "";

  const body = {
    titulo: $("#prop-titulo").value,
    categoria: $("#prop-categoria").value,
    finalidade: $("#prop-finalidade").value,
    preco: $("#prop-preco").value,
    cidade: $("#prop-cidade").value,
    estado: $("#prop-estado").value,
    bairro: $("#prop-bairro").value,
    regiao: $("#prop-regiao").value,
    areaM2: $("#prop-area").value,
    quartos: $("#prop-quartos").value,
    suites: $("#prop-suites").value,
    situacaoObra: $("#prop-situacao").value,
    minhaCasaMinhaVida: $("#prop-mcmv").checked,
    banheiros: $("#prop-banheiros").value,
    vagas: $("#prop-vagas").value,
    descricao: $("#prop-descricao").value,
    publicadoNoSite: false
  };

  try {
    const imageFiles = Array.from($("#prop-fotos").files || []);
    const pdfFiles = Array.from($("#prop-documentos").files || []);
    if (imageFiles.length > 40 || pdfFiles.length > 40) throw new Error("O limite é de 40 imagens e 40 PDFs por imóvel.");
    if (imageFiles.some(file => file.size > 50 * 1024 * 1024)) throw new Error("Cada imagem pode ter no máximo 50 MB.");
    if (pdfFiles.some(file => file.size > 100 * 1024 * 1024)) throw new Error("Cada PDF pode ter no máximo 100 MB.");
    const result = await api("/api/admin/imoveis", { method: "POST", body: JSON.stringify(body) });
    const files = [...imageFiles, ...pdfFiles];
    if (files.length) {
      const formData = new FormData();
      files.forEach(file => formData.append("arquivos", file));
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/admin/imoveis/" + encodeURIComponent(result.id) + "/arquivos", { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData });
      const uploadData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(uploadData.error || "Imóvel salvo, mas não foi possível enviar os arquivos.");
    }
    feedback.textContent = "Imóvel enviado para aprovação do administrador!";
    feedback.style.color = "var(--gold-2)";
    e.target.reset();
    await loadDashboard();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = "#f06ca8";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar para Aprovação";
  }
});

// Controles de UI
$("#agenda-lista").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-agenda-action]");
  if (!btn) return;
  updateAgenda(btn.dataset.agendaId, btn.dataset.agendaAction, btn);
});

$("#broker-property-search")?.addEventListener("input", event => {
  brokerSearchTerm = event.target.value || "";
  renderBrokerProperties();
});
$("#broker-lead-search")?.addEventListener("input", event => {
  brokerLeadSearchTerm = event.target.value || "";
  renderBrokerLeads();
});

$("#btn-refresh").addEventListener("click", loadDashboard);
$("#btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("/login.html");
});

// Inicialização
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }
  currentUser = user;
  loadDashboard();
});