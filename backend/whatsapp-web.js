"use strict";

const path = require("path");
const fs = require("fs");

let Client;
let LocalAuth;
let QRCode;
let dependencyError = null;
try {
  ({ Client, LocalAuth } = require("whatsapp-web.js"));
  QRCode = require("qrcode");
} catch (error) {
  dependencyError = error;
}

const sessionPath = path.resolve(
  process.env.WHATSAPP_SESSION_PATH || path.join(__dirname, "..", "data", "whatsapp-session")
);

let client = null;
let state = "desconectado";
let qrDataUrl = null;
let message = "";
let updatedAt = new Date().toISOString();
let starting = false;

function setState(next, detail = "") {
  state = next;
  message = detail;
  updatedAt = new Date().toISOString();
  if (next !== "qr") qrDataUrl = null;
}

function getStatus() {
  if (dependencyError) {
    return {
      status: "indisponivel",
      message: "Dependências do WhatsApp Web não instaladas. Execute npm install no servidor.",
      updatedAt
    };
  }
  return { status: state, qrDataUrl: state === "qr" ? qrDataUrl : null, message, updatedAt };
}

async function start() {
  if (process.env.WHATSAPP_WEB_ENABLED === "false") {
    setState("indisponivel", "Integração desativada pela configuração do servidor.");
    return getStatus();
  }
  if (dependencyError) return getStatus();
  if (starting || client) return getStatus();

  starting = true;
  setState("conectando", "Iniciando sessão persistente do WhatsApp Web.");
  try {
    fs.mkdirSync(sessionPath, { recursive: true, mode: 0o700 });
    const instance = new Client({
      authStrategy: new LocalAuth({
        clientId: "rd-prime-comercial",
        dataPath: sessionPath
      }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {})
      }
    });
    client = instance;

    instance.on("qr", async qr => {
      try {
        qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
        setState("qr", "Escaneie o QR Code pelo WhatsApp em Aparelhos conectados.");
        updatedAt = new Date().toISOString();
      } catch (error) {
        setState("erro", "Não foi possível gerar a imagem do QR Code: " + error.message);
      }
    });
    instance.on("authenticated", () => setState("conectando", "WhatsApp autenticado; finalizando conexão."));
    instance.on("ready", () => setState("conectado", "Sessão do WhatsApp pronta."));
    instance.on("auth_failure", detail => {
      setState("erro", "Falha na autenticação do WhatsApp: " + String(detail || "sessão inválida"));
      client = null;
    });
    instance.on("disconnected", detail => {
      setState("desconectado", "WhatsApp desconectado: " + String(detail || "sessão encerrada"));
      client = null;
    });

    await instance.initialize();
    return getStatus();
  } catch (error) {
    client = null;
    setState("erro", error.message || "Falha ao iniciar o WhatsApp Web.");
    throw error;
  } finally {
    starting = false;
  }
}

async function connect() {
  if (state === "conectado" || state === "qr" || state === "conectando") return getStatus();
  return start();
}

async function disconnect() {
  const active = client;
  client = null;
  qrDataUrl = null;
  if (active) {
    try {
      await active.logout();
    } catch (error) {
      try { await active.destroy(); } catch (_) {}
      setState("desconectado", "Sessão encerrada localmente. " + error.message);
      return getStatus();
    }
  }
  try {
    fs.rmSync(path.join(sessionPath, "session-rd-prime-comercial"), { recursive: true, force: true });
  } catch (_) {}
  setState("desconectado", "Sessão removida. Gere um novo QR Code para conectar novamente.");
  return getStatus();
}

async function sendText(phone, text) {
  if (!client || state !== "conectado") {
    throw new Error("WhatsApp Web não está conectado. Leia o QR Code no painel administrativo.");
  }
  const digits = String(phone || "").replace(/\\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("Número de WhatsApp inválido.");
  const numberId = await client.getNumberId(digits);
  if (!numberId || !numberId._serialized) throw new Error("O número " + digits + " não possui uma conta WhatsApp válida.");
  return client.sendMessage(numberId._serialized, String(text || "").slice(0, 4000));
}

module.exports = { start, connect, disconnect, getStatus, sendText };
