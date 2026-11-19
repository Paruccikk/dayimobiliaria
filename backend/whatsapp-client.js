const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode");

const AUTH_DIR = path.join(__dirname, "..", "data", "whatsapp_auth");

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.status = "disconnected"; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.qrCode = null;
    this.connectedPhone = null;
    this.isStarting = false;
    this.lastError = null;
    this.connectionTimer = null;
  }

  isConnected() {
    return this.status === "connected" && this.sock !== null;
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      connectedPhone: this.connectedPhone,
      error: this.lastError,
    };
  }

  async startConnection() {
    if (this.isStarting || this.isConnected()) {
      return this.getStatus();
    }

    this.isStarting = true;
    this.status = "connecting";
    this.lastError = null;
    clearTimeout(this.connectionTimer);
    this.connectionTimer = setTimeout(() => {
      if (this.status === "connecting") {
        this.lastError = "O WhatsApp não retornou o QR Code após 25 segundos. Tente novamente e confira os logs do servidor.";
        this.status = "error";
        this.isStarting = false;
        try { this.sock?.end(new Error(this.lastError)); } catch (_) {}
        this.sock = null;
      }
    }, 25000);

    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["Day Imobiliária", "Chrome", "1.0.0"],
        syncFullHistory: false,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await qrcode.toDataURL(qr, { margin: 2, scale: 8, errorCorrectionLevel: "H" });
            this.status = "qr_ready";
            this.lastError = null;
            clearTimeout(this.connectionTimer);
            console.log("[WhatsApp] QR Code gerado e disponível no painel.");
          } catch (err) {
            this.lastError = err.message || "Falha ao converter o QR Code em imagem.";
            this.status = "error";
            console.error("[WhatsApp] Erro ao gerar QR Code:", err);
          }
        }

        if (connection === "close") {
          clearTimeout(this.connectionTimer);
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Conexão fechada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);

          this.status = "disconnected";
          this.lastError = statusCode ? `Conexão encerrada pelo WhatsApp (código ${statusCode}).` : null;
          this.qrCode = null;
          this.connectedPhone = null;
          this.sock = null;
          this.isStarting = false;

          if (statusCode === DisconnectReason.loggedOut) {
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (e) {}
          } else if (shouldReconnect) {
            setTimeout(() => this.startConnection(), 3000);
          }
        } else if (connection === "open") {
          clearTimeout(this.connectionTimer);
          this.status = "connected";
          this.lastError = null;
          this.qrCode = null;
          this.isStarting = false;
          const rawId = this.sock?.user?.id || "";
          this.connectedPhone = rawId.split(":")[0] || rawId.split("@")[0] || null;
          console.log(`[WhatsApp] ✅ Conectado com sucesso ao WhatsApp! Número: ${this.connectedPhone}`);
        }
      });
    } catch (error) {
      console.error("[WhatsApp] Erro ao iniciar cliente:", error);
      clearTimeout(this.connectionTimer);
      this.status = "error";
      this.lastError = error.message || "Não foi possível iniciar a conexão do WhatsApp.";
      this.isStarting = false;
    }

    return this.getStatus();
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
        this.sock.end(undefined);
      }
    } catch (e) {}

    clearTimeout(this.connectionTimer);
    this.sock = null;
    this.status = "disconnected";
    this.lastError = null;
    this.qrCode = null;
    this.connectedPhone = null;
    this.isStarting = false;

    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (e) {}

    return this.getStatus();
  }

  async sendAlert(phone, title, message, link, imageUrl = null) {
    if (!this.isConnected()) {
      throw new Error("WhatsApp não está conectado via QR Code.");
    }

    const cleanPhone = String(phone || "").replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      throw new Error("Número de telefone inválido.");
    }

    const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone;
    const jid = `${fullPhone}@s.whatsapp.net`;
    const text = `📢 *${title}*\n\n${message}\n\n🔗 *Acesse o imóvel:* ${link}`;

    // Envia a foto principal como mídia com legenda; mantém texto como fallback.
    if (typeof imageUrl === "string" && /^https:\/\//i.test(imageUrl)) {
      try {
        return await this.sock.sendMessage(jid, {
          image: { url: imageUrl },
          caption: text
        });
      } catch (error) {
        console.warn("[WhatsApp] Não foi possível enviar a foto; tentando texto:", error.message);
      }
    }

    return await this.sock.sendMessage(jid, { text });
  }
}

const whatsappClient = new WhatsAppClient();

// Se já houver credenciais salvas, reconecta em segundo plano
try {
  if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    setTimeout(() => whatsappClient.startConnection(), 2000);
  }
} catch (e) {}

module.exports = whatsappClient;
