const $ = selector => document.querySelector(selector);
const form = $("#wizard-form");
const btnSubmit = $("#btn-submit");

let currentStep = 1;

// Atualiza a tela (mostra a etapa atual e a barra de progresso)
function updateWizard() {
  // Esconde todos e mostra o atual
  document.querySelectorAll(".form-step").forEach(el => el.classList.remove("active"));
  $(`#step-${currentStep}`).classList.add("active");

  // Atualiza os botões da barra
  document.querySelectorAll(".step").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.step) <= currentStep);
  });

  // Atualiza a barra de progresso (0%, 33%, 66%, 100%)
  const progress = ((currentStep - 1) / 3) * 100;
  $("#progress-bar").style.width = `${progress}%`;
}

// Botões de Próximo e Voltar
document.querySelectorAll(".next-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    // Valida os inputs da etapa atual antes de avançar
    const currentFields = $(`#step-${currentStep}`).querySelectorAll("input[required], select[required]");
    let valid = true;
    currentFields.forEach(field => {
      if (!field.value.trim()) {
        field.style.borderColor = "#f06ca8";
        valid = false;
      } else {
        field.style.borderColor = "";
      }
    });
    
    if (valid) {
      currentStep++;
      updateWizard();
    } else {
      alert("Por favor, preencha todos os campos obrigatórios.");
    }
  });
});

document.querySelectorAll(".prev-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentStep--;
    updateWizard();
  });
});

// Máscaras simples de digitação (WhatsApp e CPF)
$("#whatsapp").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length > 10) v = v.replace(/(\d{5})(\d{4})$/, "$1-$2");
  e.target.value = v;
});

$("#cpf").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  e.target.value = v;
});

// Envio do Formulário
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Enviando…";

  // Coleta os dados preenchidos
  const nome = $("#nome").value;
  const whatsapp = $("#whatsapp").value;
  const cpf = $("#cpf").value;
  
  // Monta uma mensagem estruturada para salvar no banco de dados (tabela de leads)
  const mensagem = `
--- SOLICITAÇÃO DE ANÚNCIO ---
Contato: ${$("#email").value}

IDENTIFICAÇÃO:
CPF: ${cpf}
Tipo: ${$("#tipo-anunciante").value}

LOCALIZAÇÃO:
Endereço: ${$("#endereco").value}, ${$("#bairro").value} - ${$("#cidade").value} (CEP: ${$("#cep").value})

IMÓVEL:
Tipo: ${$("#tipo-imovel").value}
Modalidade: ${$("#modalidade").value}
Valor: R$ ${$("#valor").value}
Área: ${$("#area").value || "Não informada"} m²
Quartos: ${$("#quartos").value || 0}
Vagas: ${$("#vagas").value || 0}
Fotos/Links: ${$("#links").value || "Nenhum link enviado"}
  `.trim();

  try {
    // Envia para a rota de leads do seu servidor
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome,
        telefone: whatsapp,
        mensagem: mensagem,
        imovelId: null // É uma captação, não um lead de imóvel já existente
      })
    });

    if (!res.ok) throw new Error("Falha ao enviar.");

    // Mostra a tela de sucesso e esconde o form
    form.style.display = "none";
    $(".wizard-progress").style.display = "none";
    $("#success-screen").style.display = "block";
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    alert("Ocorreu um erro ao enviar seus dados. Por favor, tente novamente ou chame no WhatsApp.");
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Enviar para Avaliação ✓";
  }
});