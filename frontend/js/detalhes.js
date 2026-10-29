import { money, categoryLabel, purposeLabel, safeText } from "./common.js";

document.querySelector("#year").textContent = new Date().getFullYear();

const id = new URLSearchParams(location.search).get("id");
const root = document.querySelector("#property-detail");

const FALLBACK = "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85";

if (!id) {
  root.innerHTML = '<div class="empty-state">Código do imóvel não informado.</div>';
} else {
  try {
    const r = await fetch(`/api/imoveis/${encodeURIComponent(id)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Imóvel não encontrado.");

    const p = d.item;
    const photos = (p.fotos || []).filter(Boolean);
    const cover = photos[0] || FALLBACK;
    const gallery = photos.slice(1);

    const location = [p.bairro, p.cidade, p.estado].filter(Boolean).join(", ");

    const waMessage = encodeURIComponent(
      `Olá! Tenho interesse no imóvel ${p.titulo} (ref. ${p.codigo || p.id}). Gostaria de mais informações.`
    );

    const features = [
      p.areaM2 && { value: p.areaM2, label: "m²" },
      p.quartos && { value: p.quartos, label: p.quartos == 1 ? "quarto" : "quartos" },
      p.suites && { value: p.suites, label: p.suites == 1 ? "suíte" : "suítes" },
      p.banheiros && { value: p.banheiros, label: p.banheiros == 1 ? "banheiro" : "banheiros" },
      p.vagas && { value: p.vagas, label: p.vagas == 1 ? "vaga" : "vagas" },
    ].filter(Boolean);

    const featuresHTML = features.length
      ? `<div class="detail-features">
          ${features.map((f) => `
            <div>
              <strong>${safeText(f.value)}</strong>
              <span>${safeText(f.label)}</span>
            </div>`).join("")}
        </div>`
      : "";

    const featurePills = [
      p.areaM2 && `<span>▱ ${safeText(p.areaM2)} m²</span>`,
      p.quartos && `<span>▦ ${safeText(p.quartos)} quartos</span>`,
      p.vagas && `<span>⌑ ${safeText(p.vagas)} vagas</span>`,
    ].filter(Boolean).join("");

    root.innerHTML = `
      <div class="detail-grid">
        <div class="detail-main">
          <div class="detail-header">
            <div class="detail-category">
              ${safeText(categoryLabel(p.categoria))} · ${safeText(purposeLabel(p.finalidade))}
            </div>
            <h1 class="detail-title">${safeText(p.titulo)}</h1>
            <p class="detail-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${safeText(location || "Consulte a localização")}
            </p>
          </div>

          <div class="detail-gallery">
            <img class="detail-main-image" src="${safeText(cover)}" alt="${safeText(p.titulo)}">
          </div>

          ${gallery.length ? `<div class="detail-thumbs">
              ${gallery.map((src) => `<img loading="lazy" src="${safeText(src)}" alt="Foto do imóvel ${safeText(p.titulo)}">`).join("")}
            </div>` : ""}

          <section class="detail-about">
            <h2>Sobre o imóvel</h2>
            <p>${safeText(p.descricao || "Entre em contato com nossa equipe para saber mais sobre este imóvel.")}</p>
          </section>
        </div>

        <aside class="detail-card">
          <div class="detail-ref">REF. ${safeText(String(p.codigo || p.id || "").slice(0, 12).toUpperCase())}</div>

          <div class="detail-price">
            <small>Valor</small>
            ${money(p.preco)}
          </div>

          ${featuresHTML}

          ${featurePills ? `<div class="property-features">${featurePills}</div>` : ""}

          <a class="button button-gold detail-cta" target="_blank" rel="noopener"
             href="https://wa.me/?text=${waMessage}">
            <span>Consultar pelo WhatsApp</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
          </a>
          
          <button class="button button-outline" style="width:100%; justify-content:center; margin-top:10px;" onclick="document.getElementById('modal-visita').style.display='flex'">
            📅 Agendar Visita
          </button>

          <p class="detail-note">
            Nossa equipe está à disposição para fornecer mais detalhes e agendar uma visita.
          </p>
        </aside>
      </div>

      <!-- MODAL DE AGENDAMENTO -->
      <div id="modal-visita" style="display:none; position:fixed; inset:0; background:rgba(5,6,10,0.85); z-index:9999; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
        <div class="panel" style="width:100%; max-width:420px; position:relative; margin:20px; background:var(--bg-elev); border:1px solid var(--border-strong); box-shadow:var(--shadow-card);">
          <button onclick="document.getElementById('modal-visita').style.display='none'" style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--text-mute); font-size:24px; cursor:pointer;">&times;</button>
          
          <h3 style="font-family:var(--font-display); font-size:1.4rem; margin-bottom:20px; color:var(--text);">Agendar Visita</h3>
          
          <div class="field" style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; color:var(--text-mute); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.1em;">Tipo de Visita</label>
            <select id="visita-tipo" style="width:100%; padding:12px; border-radius:8px; background:#fff; color:#000;">
              <option value="Presencial" style="color:black;">Presencial</option>
              <option value="Vídeochamada" style="color:black;">Vídeochamada</option>
            </select>
          </div>
          
          <div class="field" style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; color:var(--text-mute); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.1em;">Data</label>
            <input type="date" id="visita-data" min="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:var(--text);">
          </div>

          <div class="field" style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; color:var(--text-mute); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.1em;">Turno</label>
            <select id="visita-turno" style="width:100%; padding:12px; border-radius:8px; background:#fff; color:#000;">
              <option value="Manhã" style="color:black;">Manhã (08h - 12h)</option>
              <option value="Tarde" style="color:black;">Tarde (12h - 18h)</option>
              <option value="Noite" style="color:black;">Noite (18h - 21h)</option>
            </select>
          </div>

          <div class="field" style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; color:var(--text-mute); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.1em;">Seu Nome</label>
            <input type="text" id="visita-nome" placeholder="Nome completo" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:var(--text);">
          </div>
          
          <div class="field" style="margin-bottom:24px;">
            <label style="display:block; font-size:12px; color:var(--text-mute); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.1em;">Seu WhatsApp</label>
            <input type="tel" id="visita-telefone" placeholder="(11) 99999-9999" style="width:100%; padding:12px; border-radius:8px; background:var(--bg); border:1px solid var(--border); color:var(--text);">
          </div>

          <button class="button button-gold" id="btn-confirmar-visita" style="width:100%;">Confirmar Agendamento</button>
          <p id="visita-feedback" style="text-align:center; font-size:13px; margin-top:12px; color:var(--gold-2);"></p>
        </div>
      </div>
    `;

    // Lógica para enviar o agendamento
    document.getElementById("btn-confirmar-visita").addEventListener("click", async () => {
      const btn = document.getElementById("btn-confirmar-visita");
      const feedback = document.getElementById("visita-feedback");
      
      const nome = document.getElementById("visita-nome").value;
      const telefone = document.getElementById("visita-telefone").value;
      const data = document.getElementById("visita-data").value;
      const turno = document.getElementById("visita-turno").value;
      const tipo = document.getElementById("visita-tipo").value;

      if (!nome || !telefone || !data) {
        feedback.textContent = "Preencha nome, WhatsApp e data.";
        feedback.style.color = "#f06ca8";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Enviando...";

      try {
        const res = await fetch("/api/agendamentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imovelId: p.id,
            corretorUid: p.responsavelUid || null,
            nome, telefone, data, turno, tipo
          })
        });
        
        if (!res.ok) throw new Error();
        
        feedback.textContent = "Visita agendada com sucesso! O corretor entrará em contato.";
        feedback.style.color = "#4ade80";
        btn.textContent = "Agendado ✓";
        setTimeout(() => {
          document.getElementById("modal-visita").style.display = "none";
          btn.disabled = false;
          btn.textContent = "Confirmar Agendamento";
          feedback.textContent = "";
        }, 3000);
      } catch (e) {
        feedback.textContent = "Erro ao agendar. Tente novamente.";
        feedback.style.color = "#f06ca8";
        btn.disabled = false;
        btn.textContent = "Confirmar Agendamento";
      }
    });

  } catch (err) {
    root.innerHTML = `<div class="empty-state">${safeText(err.message)}</div>`;
  }
}