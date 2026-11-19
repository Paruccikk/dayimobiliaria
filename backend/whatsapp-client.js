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
  }

  isConnected() {
    return this.status === "connected" && this.sock !== null;
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      connectedPhone: this.connectedPhone,
    };
  }

  async startConnection() {
    if (this.isStarting || this.isConnected()) {
      return this.getStatus();
    }

    this.isStarting = true;
    this.status = "connecting";

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
            this.qrCode = await qrcode.toDataURL(qr, { margin: 2, scale: 7 });
            this.status = "qr_ready";
          } catch (err) {
            console.error("[WhatsApp] Erro ao gerar QR Code:", err);
          }
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Conexão fechada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);

          this.status = "disconnected";
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
          this.status = "connected";
          this.qrCode = null;
          this.isStarting = false;
          const rawId = this.sock?.user?.id || "";
          this.connectedPhone = rawId.split(":")[0] || rawId.split("@")[0] || null;
          console.log(`[WhatsApp] ✅ Conectado com sucesso ao WhatsApp! Número: ${this.connectedPhone}`);
        }
      });
    } catch (error) {
      console.error("[WhatsApp] Erro ao iniciar cliente:", error);
      this.status = "disconnected";
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

    this.sock = null;
    this.status = "disconnected";
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

    // Faz somente uma tentativa por destinatário. Se a confirmação do envio da mídia
    // falhar, não reenviamos texto automaticamente: a entrega pode ter ocorrido e o
    // fallback poderia gerar uma segunda mensagem para a mesma pessoa.
    if (typeof imageUrl === "string" && /^https:\/\//i.test(imageUrl)) {
      return await this.sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: text
      });
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
