import { auth } from "./firebase-client.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = selector => document.querySelector(selector);
let currentUser = null;

async function api(url, options = {}) {
  if (!currentUser) throw new Error("Entre na sua conta para continuar.");
  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}
function feedback(text, error = false) {
  const el = $("#conta-feedback");
  if (el) { el.textContent = text; el.dataset.error = error ? "true" : "false"; }
}
function setValue(id, value) { const el = $("#" + id); if (el) el.value = value || ""; }

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) { location.href = "/login.html?redirect=/minha-conta.html"; return; }
  try {
    const data = await api("/api/auth/perfil");
    const profile = data.perfil || {};
    if (profile.papel !== "administrador" || profile.ativo !== true || profile.status !== "ativo") {
      location.replace("/");
      return;
    }
    const address = profile.endereco || {};
    ["cep","numero","rua","complemento","bairro","cidade","estado"].forEach(key => setValue(key, address[key]));
    $("#consent-location").checked = profile.consentimentos?.localizacao === true || address.consentimentoLocalizacao === true;
    $("#conta-loading").hidden = true;
    $("#conta-form").hidden = false;
  } catch (error) {
    $("#conta-loading").textContent = error.message;
  }
});

$("#cep")?.addEventListener("input", event => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
  event.target.value = digits.length > 5 ? digits.slice(0,5) + "-" + digits.slice(5) : digits;
});
$("#estado")?.addEventListener("input", event => { event.target.value = event.target.value.toUpperCase().slice(0,2); });

$("#conta-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#save-address");
  button.disabled = true;
  feedback("Validando endereço e salvando...");
  const endereco = Object.fromEntries(["cep","rua","numero","complemento","bairro","cidade","estado"].map(key => [key, $("#" + key).value.trim()]));
  try {
    const result = await api("/api/conta/perfil", {
      method: "PATCH",
      body: JSON.stringify({ endereco, consentimentoLocalizacao: $("#consent-location").checked, visitorId: localStorage.getItem("rdprime.alertaDay.visitor.v1") || "" })
    });
    feedback(result.localizacaoAtiva
      ? "Endereço salvo e localização regional autorizada. Sua conta já pode ser considerada no alcance de campanhas próximas."
      : "Endereço salvo. A localização regional está desativada; marque a autorização se quiser participar dos cálculos por região.");
  } catch (error) {
    feedback(error.message, true);
  } finally {
    button.disabled = false;
  }
});
