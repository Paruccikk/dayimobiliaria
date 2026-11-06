require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.join(__dirname, "frontend");
const UPLOAD_ROOT = path.join(__dirname, "uploads", "imoveis");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

app.disable("x-powered-by");
// Render fica atrás de proxy reverso; necessário para rate-limit identificar IP corretamente.
app.set("trust proxy", 1);

// --------------------------------------------------
// SEGURANÇA E CONFIGURAÇÃO HTTP
// --------------------------------------------------

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.gstatic.com"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://*.firebasedatabase.app",
          "https://*.firebaseapp.com",
          "https://securetoken.googleapis.com",
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  })
);

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Arquivos públicos do frontend
app.use(express.static(FRONTEND_DIR));

// Fotos dos imóveis
app.use("/uploads/imoveis", (req, res, next) => {
  // Materiais de lançamentos são servidos por rota autenticada abaixo.
  if (req.path.startsWith("/empreendimentos/")) return next();
  return express.static(UPLOAD_ROOT, {
    dotfiles: "deny", index: false,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  })(req, res, next);
});

// --------------------------------------------------
// FIREBASE ADMIN
// --------------------------------------------------

let admin = null;
let db = null;
let auth = null;
let firebaseAdminError = null;

try {
  admin = require("firebase-admin");

  if (!admin.apps.length) {
    let credential;
    
    // ✅ 1. Tenta ler pelo arquivo físico (padrão do Render Secret Files)
    const secretFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (secretFilePath && fs.existsSync(secretFilePath)) {
      console.log(`[Firebase] Lendo credenciais do arquivo: ${secretFilePath}`);
      const fileContent = fs.readFileSync(secretFilePath, "utf8");
      credential = admin.credential.cert(JSON.parse(fileContent));
    } 
    // ✅ 2. Fallback: Tenta pelo Base64 (se existir)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
      console.log("[Firebase] Lendo credenciais via Base64");
      const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.replace(/\s+/g, "");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      credential = admin.credential.cert(JSON.parse(decoded));
    }
    // ✅ 3. Fallback: Tenta pelo JSON bruto
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.log("[Firebase] Lendo credenciais via JSON bruto");
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } 
    // ⚠️ 4. Fallback local
    else {
      console.log("[Firebase] Usando applicationDefault()");
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ||
        "https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com",
    });
  }

  db = admin.database();
  auth = admin.auth();

  console.log("✅ Firebase Admin inicializado com sucesso.");
} catch (error) {
  firebaseAdminError = error;
  console.error("❌ ERRO AO INICIALIZAR O FIREBASE ADMIN:", error.message);
}

function firebaseUnavailable(res) {
  const details =
    firebaseAdminError?.message ||
    "Verifique as credenciais do Firebase Admin.";

  return res.status(503).json({
    error: "Firebase Admin indisponível no servidor.",
    ...(process.env.NODE_ENV !== "production" ? { details } : {}),
  });
}

// --------------------------------------------------
// FUNÇÕES AUXILIARES
// --------------------------------------------------

function cleanString(value, max = 3000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function isValidUid(uid) {
  return (
    typeof uid === "string" &&
    uid.length > 0 &&
    uid.length <= 128 &&
    !uid.includes("/") &&
    uid !== "." &&
    uid !== ".."
  );
}

function sendServerError(res, message, error) {
  console.error(message, error?.stack || error?.message || error);

  return res.status(500).json({
    error: message,
  });
}

// ✅ Promise.race com timeout reutilizável
function withTimeout(promise, ms, code = "TIMEOUT_CONSULTA_FIREBASE") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(code)), ms)
    ),
  ]);
}

// ✅ Busca imóveis publicados com retry + timeouts maiores.
// Isso resolve o 504 no Render quando o cold start ou o Firebase estão lentos.
async function fetchPublishedPropertiesWithRetry(maxAttempts = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();

    try {
      // .once("value") é mais estável que .get() no Admin SDK.
      const snapshot = await withTimeout(
        db.ref("imoveis").once("value"),
        attempt === 1 ? 25000 : 40000
      );

      const all = snapshot.val() || {};

      const items = Object.entries(all)
        .map(([id, value]) => ({ id, ...value }))
        .filter(
          (item) =>
            item.status === "publicado" &&
            item.publicadoNoSite === true
        );

      console.log(
        `[API] Tentativa ${attempt} OK em ${Date.now() - t0}ms: ` +
        `${items.length} imóveis publicados.`
      );

      return items;
    } catch (error) {
      lastError = error;
      console.warn(
        `[API] Tentativa ${attempt}/${maxAttempts} falhou em ` +
        `${Date.now() - t0}ms: ${error.message}`
      );

      if (attempt < maxAttempts) {
        // Pequena espera antes de tentar novamente
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  throw lastError;
}

const allowedCategories = new Set([
  "residencial",
  "comercial",
  "sublocacao",
  "garagem",
  "lancamento",
]);

const allowedPurposes = new Set(["venda", "locacao", "temporada"]);

const allowedPropertyStatuses = new Set([
  "rascunho",
  "aguardando_aprovacao",
  "publicado",
  "reservado",
  "vendido",
  "alugado",
  "inativo",
]);

const allowedUserRoles = new Set(["cliente", "corretor", "gerente", "administrador"]);

// --------------------------------------------------
// SAÚDE DO SERVIDOR
// --------------------------------------------------

app.get("/api/health", async (_req, res) => {
  const base = {
    ok: true,
    service: "rd-prime-imoveis",
    firebaseAdminConfigured: Boolean(auth && db),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  // Ping rápido no Firebase (não bloqueia se estiver lento)
  if (db) {
    try {
      const t0 = Date.now();
      await withTimeout(db.ref(".info/connected").once("value"), 3000);
      base.firebase = { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      base.firebase = { ok: false, error: err.message };
    }
  } else {
    base.firebase = { ok: false, error: "Firebase não inicializado." };
  }

  return res.json(base);
});

// --------------------------------------------------
// DIAGNÓSTICO TEMPORÁRIO
// ⚠️ Remova esta rota em produção quando não precisar mais.
// Acesse: /api/debug/firebase
// --------------------------------------------------

app.get("/api/debug/firebase", async (_req, res) => {
  const info = {
    nodeEnv: process.env.NODE_ENV || "(não definido)",
    hasServiceAccountBase64: Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
    ),
    hasServiceAccountJson: Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ),
    databaseURL:
      process.env.FIREBASE_DATABASE_URL || "(default hardcoded no código)",
    adminInitialized: Boolean(admin && admin.apps.length),
    dbAvailable: Boolean(db),
    authAvailable: Boolean(auth),
    firebaseAdminError: firebaseAdminError?.message || null,
  };

  if (db) {
    const t0 = Date.now();
    try {
      const snap = await withTimeout(
        db.ref("imoveis").once("value"),
        15000
      );
      const data = snap.val() || {};
      const all = Object.values(data);
      info.ping = {
        ok: true,
        ms: Date.now() - t0,
        totalImoveis: all.length,
        publicados: all.filter(
          (i) => i.status === "publicado" && i.publicadoNoSite === true
        ).length,
      };
    } catch (err) {
      info.ping = {
        ok: false,
        ms: Date.now() - t0,
        error: err.message,
      };
    }
  }

  return res.json(info);
});

// --------------------------------------------------
// CADASTRO PÚBLICO
//
// O frontend cria a conta no Firebase Authentication
// e envia o ID token para esta rota.
//
// O servidor define o papel. Nunca confiar no papel
// enviado pelo navegador.
// --------------------------------------------------

app.post("/api/auth/registrar", async (req, res) => {
  if (!auth || !db) {
    return firebaseUnavailable(res);
  }

  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: "Token de autenticação não enviado.",
    });
  }

  let decoded;

  try {
    decoded = await auth.verifyIdToken(token);
  } catch (error) {
    console.error("Token inválido no cadastro:", error.message);

    return res.status(401).json({
      error: "Sessão inválida. Entre novamente e tente cadastrar.",
    });
  }

  const nome = cleanString(req.body?.nome, 120);
  const telefone = cleanString(req.body?.telefone, 30);
  const solicitacaoPapel =
    req.body?.tipoCadastro === "corretor" ? "corretor" : "cliente";

  if (!nome || !telefone) {
    return res.status(400).json({
      error: "Nome e telefone são obrigatórios.",
    });
  }

  try {
    const userRecord = await auth.getUser(decoded.uid);
    const userRef = db.ref(`usuarios/${decoded.uid}`);

    const existing = await userRef.get();

    if (existing.exists()) {
      return res.status(409).json({
        error: "Já existe um perfil para esta conta. Procure o administrador.",
      });
    }

    const profile = {
      nome,
      email: userRecord.email || decoded.email || "",
      telefone,
      papel: "cliente",
      solicitacaoPapel,
      ativo: true,
      status: "ativo",
      criadoEm: new Date().toISOString(),
    };

    await userRef.set(profile);

    return res.status(201).json({
      ok: true,
      papel: "cliente",
      solicitacaoPapel,
      ativo: true,
      status: "ativo",
      message: "Cadastro de cliente concluído com sucesso.",
    });
  } catch (error) {
    return sendServerError(
      res,
      "Não foi possível gravar o cadastro no Firebase.",
      error
    );
  }
});

// --------------------------------------------------
// AUTENTICAÇÃO E AUTORIZAÇÃO
// --------------------------------------------------

async function requireAuthenticated(req, res, next) {
  if (!auth || !db) return firebaseUnavailable(res);

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Autenticação necessária." });
  }

  try {
    req.user = await auth.verifyIdToken(token);
    const snapshot = await db.ref(`usuarios/${req.user.uid}`).get();
    req.profile = snapshot.val() || null;
    return next();
  } catch (error) {
    if (
      error?.code === "auth/id-token-expired" ||
      error?.code === "auth/argument-error" ||
      error?.code === "auth/id-token-revoked"
    ) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    return sendServerError(
      res,
      "Não foi possível validar a sessão e consultar o perfil.",
      error
    );
  }
}

function requireFirebase(req, res, next) {
  return requireAuthenticated(req, res, () => {
    if (!req.profile) {
      return res.status(403).json({
        error:
          "Perfil não cadastrado. Complete o cadastro e aguarde a aprovação.",
      });
    }
    if (req.profile.ativo !== true || req.profile.status !== "ativo") {
      return res.status(403).json({
        error: "Seu acesso está pendente ou inativo.",
      });
    }
    return next();
  });
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.papel)) {
      return res.status(403).json({
        error: "Você não tem permissão para esta operação.",
      });
    }

    return next();
  };
}

app.get("/api/auth/perfil", requireAuthenticated, (req, res) => {
  return res.json({
    perfil: req.profile,
    autenticado: true,
    aprovado:
      req.profile?.ativo === true && req.profile?.status === "ativo",
  });
});

// --------------------------------------------------
// ADMINISTRAÇÃO DE USUÁRIOS
// --------------------------------------------------

app.get(
  "/api/admin/usuarios",
  requireFirebase,
  allowRoles("administrador"),
  async (_req, res) => {
    try {
      const snapshot = await db.ref("usuarios").get();
      const users = snapshot.val() || {};

      const items = Object.entries(users).map(([uid, user]) => ({
        uid,
        ...user,
      }));

      return res.json({ items });
    } catch (error) {
      return sendServerError(
        res,
        "Não foi possível carregar os usuários.",
        error
      );
    }
  }
);

app.patch(
  "/api/admin/usuarios/:uid",
  requireFirebase,
  allowRoles("administrador"),
  async (req, res) => {
    const uid = cleanString(req.params.uid, 128);
    const body = req.body || {};
    const updates = {};

    if (!isValidUid(uid)) {
      return res.status(400).json({ error: "UID inválido." });
    }

    if (Object.hasOwn(body, "papel")) {
      if (!allowedUserRoles.has(body.papel)) {
        return res.status(400).json({ error: "Perfil inválido." });
      }
      updates.papel = body.papel;
    }

    if (Object.hasOwn(body, "gerenteUid") || body.papel === "corretor") {
      const gerenteUid = cleanString(body.gerenteUid, 128);
      if (body.papel === "corretor" && gerenteUid) {
        if (!isValidUid(gerenteUid)) return res.status(400).json({ error: "Gerente inválido." });
        const gerenteSnapshot = await db.ref("usuarios/" + gerenteUid).get();
        const gerente = gerenteSnapshot.val();
        if (!gerente || gerente.papel !== "gerente" || gerente.ativo !== true || gerente.status !== "ativo") {
          return res.status(400).json({ error: "Selecione um gerente ativo." });
        }
        updates.gerenteUid = gerenteUid;
      } else {
        updates.gerenteUid = null;
      }
    }

    if (Object.hasOwn(body, "ativo")) {
      if (typeof body.ativo !== "boolean") {
        return res.status(400).json({
          error: "O campo ativo deve ser verdadeiro ou falso.",
        });
      }
      updates.ativo = body.ativo;
      updates.status = body.ativo ? "ativo" : "inativo";
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Informe um perfil e/ou status para atualizar.",
      });
    }

    if (uid === req.user.uid && updates.ativo === false) {
      return res.status(400).json({
        error: "Você não pode desativar sua própria conta.",
      });
    }

    if (
      uid === req.user.uid &&
      updates.papel &&
      updates.papel !== "administrador"
    ) {
      return res.status(400).json({
        error: "Você não pode remover seu próprio perfil de administrador.",
      });
    }

    try {
      const userRef = db.ref(`usuarios/${uid}`);
      const snapshot = await userRef.get();

      if (!snapshot.exists()) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      updates.atualizadoEm = new Date().toISOString();

      if (updates.papel && updates.papel !== "corretor") updates.gerenteUid = null;
      await userRef.update(updates);

      return res.json({ ok: true, uid, updates });
    } catch (error) {
      return sendServerError(
        res,
        "Não foi possível atualizar o usuário.",
        error
      );
    }
  }
);

// --------------------------------------------------
// DASHBOARD ADMINISTRATIVO
// --------------------------------------------------

app.get(
  "/api/admin/dashboard",
  requireFirebase,
  allowRoles("administrador"),
  async (_req, res) => {
    try {
      const [propertiesSnapshot, usersSnapshot, leadsSnapshot, visitsSnapshot, bookingsSnapshot] =
        await Promise.all([
          db.ref("imoveis").get(), db.ref("usuarios").get(), db.ref("leads").get(),
          db.ref("visitas").get(), db.ref("agendamentos").get(),
        ]);

      const propertiesRaw = propertiesSnapshot.val() || {};
      const usersRaw = usersSnapshot.val() || {};
      const leadsRaw = leadsSnapshot.val() || {};
      const visitasRaw = visitsSnapshot.val() || {};
      const agendamentosRaw = bookingsSnapshot.val() || {};

      const imoveis = Object.entries(propertiesRaw).map(([id, item]) => ({
        id,
        ...item,
      }));

      const usuarios = Object.entries(usersRaw).map(([uid, item]) => ({
        uid,
        ...item,
      }));

      const leads = Object.entries(leadsRaw).map(([id, item]) => ({
        id,
        ...item,
      }));

      const publicados = imoveis.filter(
        (item) =>
          item.status === "publicado" && item.publicadoNoSite === true
      );

      const pendentes = imoveis.filter(
        (item) => item.status === "aguardando_aprovacao"
      );

      const clientes = usuarios.filter((item) => item.papel === "cliente");
      const corretores = usuarios.filter(
        (item) =>
          item.papel === "corretor" &&
          item.ativo === true &&
          item.status === "ativo"
      );

      const leadsNovos = leads.filter(item => !item.status || item.status === "novo");
      const visitas = Object.entries(visitasRaw).map(([id, item]) => ({ id, ...item }));
      const agendamentos = Object.entries(agendamentosRaw).map(([id, item]) => ({ id, ...item }));
      const visitasAll = [...visitas, ...agendamentos.map(item => ({
        ...item,
        status: item.statusOperacional || ({ pendente: "pendente", confirmado: "confirmada", concluido: "realizada", recusado: "recusada" })[item.status] || item.status
      }))];
      const corretoresTodos = usuarios.filter(item => item.papel === "corretor");
      const gerentes = usuarios.filter(item => item.papel === "gerente");
      const corretorStats = corretoresTodos.map(user => {
        const ownLeads = leads.filter(item => item.responsavelUid === user.uid);
        const ownProperties = imoveis.filter(item => item.responsavelUid === user.uid);
        const ownVisits = visitasAll.filter(item => item.corretorUid === user.uid);
        return {
          uid: user.uid, nome: user.nome || user.email || user.uid, email: user.email || "",
          gerenteUid: user.gerenteUid || null,
          leads: ownLeads.length,
          leadsNovos: ownLeads.filter(item => !item.status || item.status === "novo").length,
          propostas: ownLeads.filter(item => ["proposta_enviada", "em_analise_contrato"].includes(item.status)).length,
          fechados: ownLeads.filter(item => item.status === "fechado").length,
          imoveis: ownProperties.length, visitas: ownVisits.length,
          visitasRealizadas: ownVisits.filter(item => ["realizada", "concluido"].includes(item.status)).length
        };
      });
      const managerStats = gerentes.map(manager => {
        const team = corretorStats.filter(item => item.gerenteUid === manager.uid);
        return {
          uid: manager.uid, nome: manager.nome || manager.email || manager.uid,
          corretores: team.length,
          leads: team.reduce((sum, item) => sum + item.leads, 0),
          propostas: team.reduce((sum, item) => sum + item.propostas, 0),
          fechados: team.reduce((sum, item) => sum + item.fechados, 0),
          imoveis: team.reduce((sum, item) => sum + item.imoveis, 0),
          visitas: team.reduce((sum, item) => sum + item.visitas, 0),
          visitasRealizadas: team.reduce((sum, item) => sum + item.visitasRealizadas, 0)
        };
      });

      return res.json({
        resumo: {
          totalImoveis: imoveis.length,
          publicados: publicados.length,
          pendentes: pendentes.length,
          inativos: imoveis.filter((item) => item.status === "inativo").length,
          venda: imoveis.filter((item) => item.finalidade === "venda").length,
          locacao: imoveis.filter((item) => item.finalidade === "locacao")
            .length,
          temporada: imoveis.filter((item) => item.finalidade === "temporada")
            .length,
          totalUsuarios: usuarios.length,
          clientes: clientes.length,
          corretores: corretores.length,
          leads: leads.length,
          leadsNovos: leadsNovos.length,
        },
        imoveis: imoveis.sort((a, b) =>
          String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))
        ),
        usuarios: usuarios.sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
        ),
        leads: leads.sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))).slice(0, 100),
        produtividade: {
          visitas: visitasAll.length,
          visitasRealizadas: visitasAll.filter(item => ["realizada", "concluido"].includes(item.status)).length,
          propostas: leads.filter(item => ["proposta_enviada", "em_analise_contrato"].includes(item.status)).length,
          fechados: leads.filter(item => item.status === "fechado").length,
          gerentes: managerStats, corretores: corretorStats
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        "Não foi possível carregar os dados do dashboard.",
        error
      );
    }
  }
);

// --------------------------------------------------
// PAINEL DE GERÊNCIA
// --------------------------------------------------
app.get("/api/gerente/dashboard", requireFirebase, allowRoles("administrador", "gerente"), async (req, res) => {
  try {
    const [usersSnap, propertiesSnap, leadsSnap, visitsSnap, bookingsSnap] = await Promise.all([
      db.ref("usuarios").get(), db.ref("imoveis").get(), db.ref("leads").get(),
      db.ref("visitas").get(), db.ref("agendamentos").get()
    ]);
    const equipe = Object.entries(usersSnap.val() || {})
      .filter(([, user]) => user.papel === "corretor" && user.ativo === true && user.status === "ativo" && (req.profile.papel === "administrador" || user.gerenteUid === req.user.uid))
      .map(([uid, user]) => ({ uid, nome: user.nome || user.email || uid, email: user.email || "" }));
    const teamUids = new Set(equipe.map(user => user.uid));
    const byTeam = (raw, key) => Object.entries(raw || {}).map(([id, item]) => ({ id, ...item }))
      .filter(item => teamUids.has(item[key]));
    const imoveis = byTeam(propertiesSnap.val(), "responsavelUid");
    const leads = byTeam(leadsSnap.val(), "responsavelUid");
    const visitas = byTeam(visitsSnap.val(), "corretorUid");
    const agendamentos = byTeam(bookingsSnap.val(), "corretorUid");
    const names = Object.fromEntries(equipe.map(user => [user.uid, user.nome]));
    const annotate = items => items.map(item => ({ ...item, responsavelNome: names[item.responsavelUid || item.corretorUid] || "Corretor da equipe" }));
    const desempenhoCorretores = equipe.map(user => {
      const ownLeads = leads.filter(item => item.responsavelUid === user.uid);
      const ownProperties = imoveis.filter(item => item.responsavelUid === user.uid);
      const ownVisits = [...visitas, ...agendamentos].filter(item => item.corretorUid === user.uid);
      return {
        uid: user.uid, nome: user.nome, email: user.email,
        imoveis: ownProperties.length, leads: ownLeads.length,
        leadsNovos: ownLeads.filter(item => !item.status || item.status === "novo").length,
        propostas: ownLeads.filter(item => ["proposta_enviada", "em_analise_contrato"].includes(item.status)).length,
        fechados: ownLeads.filter(item => item.status === "fechado").length,
        visitas: ownVisits.length,
        visitasRealizadas: ownVisits.filter(item => ["realizada", "concluido"].includes(item.status || item.statusOperacional)).length
      };
    });
    return res.json({
      equipe, desempenhoCorretores, imoveis: annotate(imoveis),
      leads: annotate(leads).sort((a,b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))),
      visitas: annotate(visitas), agendamentos: annotate(agendamentos),
      resumo: { corretores: equipe.length, imoveis: imoveis.length, leads: leads.length, visitas: visitas.length + agendamentos.length }
    });
  } catch (error) {
    return sendServerError(res, "Não foi possível carregar o painel da gerência.", error);
  }
});

// --------------------------------------------------
// IMÓVEIS PÚBLICOS
// --------------------------------------------------

// Dashboard do painel do corretor: dados restritos à carteira do usuário.
app.get("/api/corretor/dashboard", requireFirebase, allowRoles("administrador", "corretor"), async (req, res) => {
  try {
    const [propertiesSnapshot, leadsSnapshot] = await Promise.all([db.ref("imoveis").get(), db.ref("leads").get()]);
    let imoveis = Object.entries(propertiesSnapshot.val() || {}).map(([id, item]) => ({ id, ...item }));
    let leads = Object.entries(leadsSnapshot.val() || {}).map(([id, item]) => ({ id, ...item }));
    if (req.profile.papel !== "administrador") {
      imoveis = imoveis.filter(item => item.responsavelUid === req.user.uid);
      leads = leads.filter(item => item.responsavelUid === req.user.uid);
    }
    imoveis.sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
    leads.sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
    return res.json({ imoveis, leads: leads.slice(0, 100) });
  } catch (error) {
    return sendServerError(res, "Não foi possível carregar os dados do painel.", error);
  }
});
app.get("/api/imoveis", async (_req, res) => {
  if (!db) {
    return firebaseUnavailable(res);
  }

  console.log("[API] Iniciando consulta de imóveis...");
  const startedAt = Date.now();

  try {
    const items = await fetchPublishedPropertiesWithRetry();

    console.log(
      `[API] Consulta concluída em ${Date.now() - startedAt}ms: ` +
      `${items.length} imóveis publicados.`
    );

    return res.json({ items });
  } catch (error) {
    console.error("[API] Falha ao consultar imóveis:", error.message);

    if (error.message === "TIMEOUT_CONSULTA_FIREBASE") {
      return res.status(504).json({
        error:
          "O Firebase demorou demais para responder. Isso pode " +
          "acontecer no primeiro acesso após o servidor hibernar. " +
          "Tente novamente em alguns segundos.",
      });
    }

    return sendServerError(
      res,
      "Não foi possível carregar os imóveis.",
      error
    );
  }
});

app.get("/api/imoveis/:id", async (req, res) => {
  if (!db) {
    return firebaseUnavailable(res);
  }

  const id = cleanString(req.params.id, 128);

  if (!id || id.includes("/")) {
    return res.status(400).json({
      error: "ID de imóvel inválido.",
    });
  }

  try {
    const snapshot = await db.ref(`imoveis/${id}`).get();
    const item = snapshot.val();

    if (
      !item ||
      item.status !== "publicado" ||
      item.publicadoNoSite !== true
    ) {
      return res.status(404).json({
        error: "Imóvel não encontrado.",
      });
    }

    return res.json({
      item: { id, ...item },
    });
  } catch (error) {
    return sendServerError(
      res,
      "Não foi possível carregar o imóvel.",
      error
    );
  }
});

// --------------------------------------------------
// LEADS DO SITE
// --------------------------------------------------

app.post("/api/leads", async (req, res) => {
  if (!db) {
    return firebaseUnavailable(res);
  }

  const nome = cleanString(req.body?.nome, 120);
  const telefone = cleanString(req.body?.telefone, 40);
  const mensagem = cleanString(req.body?.mensagem, 2000);
  const imovelId = cleanString(req.body?.imovelId, 100);

  if (!nome || !telefone) {
    return res.status(400).json({
      error: "Informe nome e telefone.",
    });
  }

  try {
    const leadRef = db.ref("leads").push();

    await leadRef.set({
      nome,
      telefone,
      mensagem,
      imovelId: imovelId || null,
      origem: "site",
      status: "novo",
      criadoEm: new Date().toISOString(),
    });

    return res.status(201).json({
      ok: true,
      id: leadRef.key,
    });
  } catch (error) {
    return sendServerError(
      res,
      "Não foi possível registrar seu contato.",
      error
    );
  }
});

// --------------------------------------------------
// UPLOAD DE FOTOS
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = cleanString(req.params.id, 100).replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );

    if (!id) {
      return cb(new Error("ID de imóvel inválido."));
    }

    const dir = path.join(UPLOAD_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });

    return cb(null, dir);
  },

  filename: (_req, file, cb) => {
    const extensions = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "application/pdf": ".pdf",
    };

    const ext = extensions[file.mimetype];

    if (!ext) {
      return cb(new Error("Formato de imagem não permitido."));
    }

    const filename = `${Date.now()}-${crypto
      .randomBytes(5)
      .toString("hex")}${ext}`;

    return cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024,
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Envie somente imagens JPG, PNG ou WEBP."));
    }

    return cb(null, true);
  },
});

app.post(
  "/api/admin/imoveis/:id/fotos",
  requireFirebase,
  allowRoles("administrador", "corretor"),
  upload.array("fotos", 20),
  async (req, res) => {
    const id = cleanString(req.params.id, 100);

    if (!id || id.includes("/")) {
      return res.status(400).json({
        error: "ID de imóvel inválido.",
      });
    }

    try {
      const ref = db.ref(`imoveis/${id}`);
      const snapshot = await ref.get();

      if (!snapshot.exists()) {
        return res.status(404).json({
          error: "Imóvel não encontrado.",
        });
      }

      const property = snapshot.val();

      if (
        req.profile.papel === "corretor" &&
        property.responsavelUid !== req.user.uid
      ) {
        return res.status(403).json({
          error: "Você só pode alterar fotos dos imóveis da sua carteira.",
        });
      }

      const novasFotos = (req.files || []).map(
        (file) => `/uploads/imoveis/${id}/${path.basename(file.filename)}`
      );

      const antigas = Array.isArray(property.fotos) ? property.fotos : [];

      const fotos = [...antigas, ...novasFotos];

      await ref.update({
        fotos,
        atualizadoEm: new Date().toISOString(),
      });

      return res.status(201).json({ fotos });
    } catch (error) {
      return sendServerError(res, "Falha ao salvar fotos.", error);
    }
  }
);

// Upload de fotos e documentos (PDF) vinculados ao imóvel recém-cadastrado.
const uploadPropertyFiles = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Formato não permitido. Envie imagens JPG/PNG/WEBP ou PDF."));
    cb(null, true);
  }
});

app.post("/api/admin/imoveis/:id/arquivos", requireFirebase, allowRoles("administrador", "corretor"), uploadPropertyFiles.array("arquivos", 20), async (req, res) => {
  const id = cleanString(req.params.id, 100);
  if (!id || id.includes("/")) return res.status(400).json({ error: "ID de imóvel inválido." });
  try {
    const ref = db.ref("imoveis/" + id);
    const snap = await ref.get();
    if (!snap.exists()) return res.status(404).json({ error: "Imóvel não encontrado." });
    const property = snap.val();
    if (req.profile.papel === "corretor" && property.responsavelUid !== req.user.uid) {
      return res.status(403).json({ error: "Você só pode anexar arquivos aos imóveis da sua carteira." });
    }
    const fotos = Array.isArray(property.fotos) ? property.fotos : [];
    const documentos = Array.isArray(property.documentos) ? property.documentos : [];
    for (const file of (req.files || [])) {
      const url = "/uploads/imoveis/" + id + "/" + path.basename(file.filename);
      const meta = { nome: cleanString(file.originalname, 180), url, mime: file.mimetype, tamanho: file.size };
      if (file.mimetype === "application/pdf") documentos.push(meta);
      else fotos.push(url);
    }
    await ref.update({ fotos, documentos, atualizadoEm: new Date().toISOString() });
    return res.status(201).json({ fotos, documentos });
  } catch (error) {
    return sendServerError(res, "Falha ao salvar arquivos do imóvel.", error);
  }
});

// --------------------------------------------------
// CADASTRAR IMÓVEL
// --------------------------------------------------

app.post(
  "/api/admin/imoveis",
  requireFirebase,
  allowRoles("administrador", "corretor"),
  async (req, res) => {
    const body = req.body || {};
    const titulo = cleanString(body.titulo, 180);

    if (
      !titulo ||
      !allowedCategories.has(body.categoria) ||
      !allowedPurposes.has(body.finalidade)
    ) {
      return res.status(400).json({
        error: "Título, categoria e finalidade válidos são obrigatórios.",
      });
    }

    const precoInformado =
      body.preco !== undefined &&
      body.preco !== null &&
      body.preco !== "";

    const preco = precoInformado ? Number(body.preco) : null;

    if (precoInformado && (!Number.isFinite(preco) || preco < 0)) {
      return res.status(400).json({ error: "Preço inválido." });
    }

    try {
      const ref = db.ref("imoveis").push();

      const status =
        req.profile.papel === "administrador" &&
        body.publicadoNoSite === true
          ? "publicado"
          : "aguardando_aprovacao";

      const item = {
        titulo,
        descricao: cleanString(body.descricao, 10000),
        categoria: body.categoria,
        finalidade: body.finalidade,
        situacaoObra: ["lancamento", "em_obras", "pronto"].includes(body.situacaoObra) ? body.situacaoObra : (body.categoria === "lancamento" ? "lancamento" : "pronto"),
        minhaCasaMinhaVida: body.minhaCasaMinhaVida === true,
        preco,
        moeda: "BRL",
        cidade: cleanString(body.cidade, 100),
        estado: cleanString(body.estado, 2).toUpperCase(),
        bairro: cleanString(body.bairro, 120),
        quartos: Math.max(0, Number(body.quartos) || 0),
        suites: Math.max(0, Number(body.suites) || 0),
        banheiros: Math.max(0, Number(body.banheiros) || 0),
        vagas: Math.max(0, Number(body.vagas) || 0),
        areaM2: Math.max(0, Number(body.areaM2) || 0),
        fotos: [],
        documentos: [],
        disponibilidade: ["disponivel","reservado","vendido"].includes(body.disponibilidade) ? body.disponibilidade : "disponivel",
        status,
        publicadoNoSite: status === "publicado",
        responsavelUid: req.user.uid,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await ref.set(item);

      return res.status(201).json({
        id: ref.key,
        item,
      });
    } catch (error) {
      return sendServerError(
        res,
        "Não foi possível cadastrar o imóvel.",
        error
      );
    }
  }
);

// --------------------------------------------------
// APROVAÇÃO DE IMÓVEIS
// --------------------------------------------------

app.patch(
  "/api/admin/imoveis/:id/aprovacao",
  requireFirebase,
  allowRoles("administrador"),
  async (req, res) => {
    const id = cleanString(req.params.id, 128);
    const status = req.body?.status;

    const allowedApprovalStatuses = [
      "publicado",
      "inativo",
      "aguardando_aprovacao",
    ];

    if (!id || id.includes("/")) {
      return res.status(400).json({
        error: "ID de imóvel inválido.",
      });
    }

    if (
      !allowedPropertyStatuses.has(status) ||
      !allowedApprovalStatuses.includes(status)
    ) {
      return res.status(400).json({ error: "Status inválido." });
    }

    try {
      const ref = db.ref(`imoveis/${id}`);
      const snapshot = await ref.get();

      if (!snapshot.exists()) {
        return res.status(404).json({
          error: "Imóvel não encontrado.",
        });
      }

      await ref.update({
        status,
        publicadoNoSite: status === "publicado",
        atualizadoEm: new Date().toISOString(),
      });

      return res.json({ ok: true });
    } catch (error) {
      return sendServerError(
        res,
        "Não foi possível atualizar a publicação.",
        error
      );
    }
  }
);



// --------------------------------------------------
// CENTRAL DE MATERIAIS E GESTÃO DA CARTEIRA
// --------------------------------------------------
const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = cleanString(req.params.id, 100).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) return cb(new Error("ID de empreendimento inválido."));
    const dir = path.join(UPLOAD_ROOT, "empreendimentos", id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const extByMime = {
      "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
      "application/pdf": ".pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
      "application/vnd.ms-excel": ".xls",
      "text/csv": ".csv"
    };
    const ext = extByMime[file.mimetype];
    if (!ext) return cb(new Error("Formato não permitido. Use JPG, PNG, WEBP, PDF, XLS, XLSX ou CSV."));
    cb(null, Date.now() + "-" + crypto.randomBytes(5).toString("hex") + ext);
  }
});
const uploadMateriais = multer({
  storage: materialStorage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg","image/png","image/webp","application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel","text/csv"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Tipo de arquivo não permitido."), allowed.includes(file.mimetype));
  }
});

function canReadDevelopment(req, item) {
  if (req.profile.papel === "administrador") return true;
  if (item.acessoTodosCorretores === true) return ["corretor","gerente"].includes(req.profile.papel);
  const allowed = Array.isArray(item.corretoresPermitidos) ? item.corretoresPermitidos : [];
  return allowed.includes(req.user.uid);
}

app.get("/api/empreendimentos", requireFirebase, allowRoles("administrador","gerente","corretor"), async (req,res) => {
  try {
    const snap = await db.ref("empreendimentos").get();
    const items = Object.entries(snap.val() || {}).map(([id,v]) => ({id,...v}))
      .filter(item => req.profile.papel === "administrador" || (item.ativo !== false && canReadDevelopment(req,item)))
      .sort((a,b) => String(a.nome||"").localeCompare(String(b.nome||"")));
    res.json({items});
  } catch(error) { sendServerError(res,"Não foi possível carregar os empreendimentos.",error); }
});

app.post("/api/empreendimentos", requireFirebase, allowRoles("administrador"), async(req,res) => {
  const nome = cleanString(req.body?.nome,160);
  if (!nome) return res.status(400).json({error:"Informe o nome do empreendimento."});
  try {
    const ref = db.ref("empreendimentos").push();
    const item = {nome, incorporadora:cleanString(req.body?.incorporadora,160),
      descricao:cleanString(req.body?.descricao,4000), endereco:cleanString(req.body?.endereco,300),
      acessoTodosCorretores:req.body?.acessoTodosCorretores === true,
      corretoresPermitidos:Array.isArray(req.body?.corretoresPermitidos) ? req.body.corretoresPermitidos.filter(isValidUid).slice(0,500) : [],
      ativo:true, materiais:[], criadoEm:new Date().toISOString(), atualizadoEm:new Date().toISOString()};
    await ref.set(item);
    res.status(201).json({id:ref.key,item});
  } catch(error) { sendServerError(res,"Não foi possível cadastrar o empreendimento.",error); }
});

app.patch("/api/empreendimentos/:id", requireFirebase, allowRoles("administrador"), async(req,res) => {
  const id=cleanString(req.params.id,100);
  const updates={atualizadoEm:new Date().toISOString()};
  for (const key of ["nome","incorporadora","descricao","endereco"]) if (Object.hasOwn(req.body||{},key)) updates[key]=cleanString(req.body[key],key==="descricao"?4000:300);
  if (Object.hasOwn(req.body||{},"acessoTodosCorretores")) updates.acessoTodosCorretores=req.body.acessoTodosCorretores===true;
  if (Object.hasOwn(req.body||{},"corretoresPermitidos")) updates.corretoresPermitidos=Array.isArray(req.body.corretoresPermitidos)?req.body.corretoresPermitidos.filter(isValidUid).slice(0,500):[];
  if (Object.hasOwn(req.body||{},"ativo")) updates.ativo=req.body.ativo===true;
  try {
    const ref=db.ref("empreendimentos/"+id); const snap=await ref.get();
    if(!snap.exists()) return res.status(404).json({error:"Empreendimento não encontrado."});
    await ref.update(updates); res.json({ok:true});
  } catch(error) { sendServerError(res,"Não foi possível atualizar o empreendimento.",error); }
});

app.post("/api/empreendimentos/:id/materiais", requireFirebase, allowRoles("administrador"), uploadMateriais.array("arquivos",30), async(req,res) => {
  const id=cleanString(req.params.id,100);
  try {
    const ref=db.ref("empreendimentos/"+id); const snap=await ref.get();
    if(!snap.exists()) return res.status(404).json({error:"Empreendimento não encontrado."});
    const item=snap.val(); const materiais=Array.isArray(item.materiais)?item.materiais:[];
    for(const file of req.files||[]) materiais.push({id:crypto.randomBytes(10).toString("hex"),
      nome:cleanString(file.originalname,180),url:"/api/empreendimentos/"+id+"/arquivos/"+path.basename(file.filename),
      mime:file.mimetype,tamanho:file.size,atualizadoEm:new Date().toISOString()});
    await ref.update({materiais,atualizadoEm:new Date().toISOString()});
    res.status(201).json({materiais});
  } catch(error) { sendServerError(res,"Não foi possível enviar os materiais.",error); }
});

app.get("/api/empreendimentos/:id/arquivos/:filename", requireFirebase, allowRoles("administrador","gerente","corretor"), async(req,res) => {
  try {
    const id=cleanString(req.params.id,100), filename=path.basename(req.params.filename);
    const snap=await db.ref("empreendimentos/"+id).get();
    if(!snap.exists()) return res.status(404).json({error:"Empreendimento não encontrado."});
    const item=snap.val();
    if(!canReadDevelopment(req,item)) return res.status(403).json({error:"Você não tem acesso a estes materiais."});
    const material=(Array.isArray(item.materiais)?item.materiais:[]).find(m=>path.basename(String(m.url||""))===filename || String(m.url||"").endsWith("/"+filename));
    if(!material) return res.status(404).json({error:"Arquivo não encontrado."});
    const filePath=path.join(UPLOAD_ROOT,"empreendimentos",id,filename);
    if(!fs.existsSync(filePath)) return res.status(404).json({error:"Arquivo não está disponível no servidor."});
    res.setHeader("Content-Disposition", "inline; filename*=UTF-8''"+encodeURIComponent(material.nome||filename));
    res.setHeader("X-Content-Type-Options","nosniff");
    return res.sendFile(filePath);
  } catch(error) { sendServerError(res,"Não foi possível abrir o material.",error); }
});

app.delete("/api/empreendimentos/:id/materiais/:materialId", requireFirebase, allowRoles("administrador"), async(req,res) => {
  try {
    const ref=db.ref("empreendimentos/"+cleanString(req.params.id,100)); const snap=await ref.get();
    if(!snap.exists()) return res.status(404).json({error:"Empreendimento não encontrado."});
    const item=snap.val(); const materiais=Array.isArray(item.materiais)?item.materiais:[];
    const target=materiais.find(m=>m.id===req.params.materialId);
    if(!target) return res.status(404).json({error:"Material não encontrado."});
    const filePath=path.join(UPLOAD_ROOT,"empreendimentos",cleanString(req.params.id,100),path.basename(target.url));
    if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await ref.update({materiais:materiais.filter(m=>m.id!==req.params.materialId),atualizadoEm:new Date().toISOString()});
    res.json({ok:true});
  } catch(error) { sendServerError(res,"Não foi possível remover o material.",error); }
});

app.patch("/api/admin/imoveis/:id/gestao", requireFirebase, allowRoles("administrador"), async(req,res) => {
  const id=cleanString(req.params.id,100); const body=req.body||{}; const updates={atualizadoEm:new Date().toISOString()};
  if(Object.hasOwn(body,"disponibilidade")) {
    if(!["disponivel","reservado","vendido"].includes(body.disponibilidade)) return res.status(400).json({error:"Disponibilidade inválida."});
    updates.disponibilidade=body.disponibilidade;
  }
  if(Object.hasOwn(body,"responsavelUid")) {
    const uid=body.responsavelUid ? cleanString(body.responsavelUid,128) : null;
    if(uid) { const u=(await db.ref("usuarios/"+uid).get()).val(); if(!u || u.papel!=="corretor" || u.ativo!==true || u.status!=="ativo") return res.status(400).json({error:"Selecione um corretor ativo."}); }
    updates.responsavelUid=uid;
  }
  try {
    const ref=db.ref("imoveis/"+id); const snap=await ref.get();
    if(!snap.exists()) return res.status(404).json({error:"Imóvel não encontrado."});
    await ref.update(updates); res.json({ok:true,updates});
  } catch(error) { sendServerError(res,"Não foi possível atualizar a gestão do imóvel.",error); }
});

// --------------------------------------------------
// AGENDAMENTO DE VISITAS
// --------------------------------------------------

// 1. Cliente cria um agendamento (Público, mas valida os dados)
app.post("/api/agendamentos", async (req, res) => {
  if (!db) return firebaseUnavailable(res);

  const { imovelId, corretorUid, nome, telefone, data, turno, tipo } = req.body || {};

  if (!imovelId || !nome || !telefone || !data || !turno || !tipo) {
    return res.status(400).json({ error: "Preencha todos os campos do agendamento." });
  }

  try {
    const ref = db.ref("agendamentos").push();
    await ref.set({
      imovelId,
      corretorUid: corretorUid || null,
      clienteNome: nome,
      clienteTelefone: telefone,
      data,
      turno,
      tipo, // "Presencial" ou "Vídeochamada"
      status: "pendente",
      criadoEm: new Date().toISOString()
    });

    return res.status(201).json({ ok: true, id: ref.key });
  } catch (error) {
    return sendServerError(res, "Não foi possível agendar a visita.", error);
  }
});

// 2. Corretor lê os agendamentos da carteira dele
app.get("/api/agendamentos", requireFirebase, async (req, res) => {
  try {
    const snapshot = await db.ref("agendamentos").get();
    const all = snapshot.val() || {};
    
    let items = Object.entries(all).map(([id, value]) => ({ id, ...value }));

    // Se não for admin, só vê os agendamentos dele
    if (req.profile.papel !== "administrador") {
      items = items.filter(a => a.corretorUid === req.user.uid);
    }

    // Ordena pelos mais recentes
    items.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));

    return res.json({ items });
  } catch (error) {
    return sendServerError(res, "Não foi possível carregar os agendamentos.", error);
  }
});

// 3. Corretor atualiza o status do agendamento
app.patch("/api/agendamentos/:id", requireFirebase, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["confirmado", "recusado", "concluido"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }

  try {
    const ref = db.ref(`agendamentos/${id}`);
    const snap = await ref.get();
    if (!snap.exists()) return res.status(404).json({ error: "Agendamento não encontrado." });

    const agendamento = snap.val();
    if (req.profile.papel !== "administrador" && agendamento.corretorUid !== req.user.uid) {
      return res.status(403).json({ error: "Sem permissão para alterar este agendamento." });
    }

    await ref.update({ status, atualizadoEm: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (error) {
    return sendServerError(res, "Erro ao atualizar agendamento.", error);
  }
});



/* AGENDA DE VISITAS */
const visitStatuses = new Set(["pendente","confirmada","recusada","realizada","cliente_faltou","proposta_apresentada"]);
function validVisitDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getFullYear() >= 2020;
}
async function canAccessVisit(req, visit) {
  if (req.profile.papel === "administrador" || visit.corretorUid === req.user.uid) return true;
  if (req.profile.papel !== "gerente" || !visit.corretorUid) return false;
  const broker = (await db.ref("usuarios/" + visit.corretorUid).get()).val();
  return broker?.papel === "corretor" && broker?.gerenteUid === req.user.uid;
}
app.get("/api/agenda/visitas", requireFirebase, allowRoles("administrador","gerente","corretor"), async(req,res)=>{
  try {
    const [visitasSnap,legacySnap] = await Promise.all([db.ref("visitas").get(),db.ref("agendamentos").get()]);
    const manual=Object.entries(visitasSnap.val()||{}).map(([id,v])=>({id,origem:"manual",...v}));
    const site=Object.entries(legacySnap.val()||{}).map(([id,v])=>({id,origem:"site",clienteNome:v.clienteNome||v.nome||"",clienteTelefone:v.clienteTelefone||v.telefone||"",imovelId:v.imovelId||"",corretorUid:v.corretorUid||null,inicio:v.inicio||v.data||"",turno:v.turno||"",tipo:v.tipo||"",status:v.statusOperacional||({pendente:"pendente",confirmado:"confirmada",concluido:"realizada",recusado:"recusada"})[v.status]||v.status||"pendente",observacoes:v.observacoes||"",criadoEm:v.criadoEm||""}));
    let items=[...manual,...site];
    if(req.profile.papel==="corretor") items=items.filter(v=>v.corretorUid===req.user.uid); if(req.profile.papel==="gerente"){const teamSnap=await db.ref("usuarios").get();const team=new Set(Object.entries(teamSnap.val()||{}).filter(([,u])=>u.papel==="corretor"&&u.gerenteUid===req.user.uid).map(([uid])=>uid));items=items.filter(v=>team.has(v.corretorUid));}
    items.sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
    return res.json({items});
  } catch(e){return sendServerError(res,"Não foi possível carregar a agenda.",e);}
});
app.post("/api/agenda/visitas", requireFirebase, allowRoles("administrador","corretor"), async(req,res)=>{
  const b=req.body||{},clienteNome=cleanString(b.clienteNome,120),clienteTelefone=cleanString(b.clienteTelefone,40),inicio=cleanString(b.inicio,16),imovelId=cleanString(b.imovelId,128);
  if(!clienteNome||!clienteTelefone||!validVisitDate(inicio))return res.status(400).json({error:"Informe cliente, telefone e data/hora válidos."});
  if(!visitStatuses.has(b.status||"confirmada"))return res.status(400).json({error:"Status de visita inválido."});
  const corretorUid=req.profile.papel==="administrador"&&isValidUid(b.corretorUid)?b.corretorUid:req.user.uid;
  try {
    if(imovelId){const p=await db.ref("imoveis/"+imovelId).get();if(!p.exists())return res.status(404).json({error:"Imóvel não encontrado."});}
    const ref=db.ref("visitas").push(),now=new Date().toISOString();
    const item={clienteNome,clienteTelefone,clienteEmail:cleanString(b.clienteEmail,160),imovelId,corretorUid,inicio,status:b.status||"confirmada",tipo:cleanString(b.tipo,40)||"Presencial",observacoes:cleanString(b.observacoes,2000),origem:"manual",criadoPor:req.user.uid,criadoEm:now,atualizadoEm:now};
    await ref.set(item);return res.status(201).json({ok:true,id:ref.key,item:{id:ref.key,...item}});
  }catch(e){return sendServerError(res,"Não foi possível cadastrar a visita.",e);}
});
app.patch("/api/agenda/visitas/:id", requireFirebase, allowRoles("administrador","gerente","corretor"), async(req,res)=>{
  const id=cleanString(req.params.id,128),status=req.body?.status;
  if(!id||id.includes("/")||!visitStatuses.has(status))return res.status(400).json({error:"ID ou status inválido."});
  try {
    const manualRef=db.ref("visitas/"+id),manualSnap=await manualRef.get();
    if(manualSnap.exists()){
      if(!(await canAccessVisit(req,manualSnap.val())))return res.status(403).json({error:"Visita fora da sua carteira ou equipe."});
      await manualRef.update({status,atualizadoEm:new Date().toISOString()});return res.json({ok:true});
    }
    const legacyRef=db.ref("agendamentos/"+id),legacySnap=await legacyRef.get();
    if(!legacySnap.exists())return res.status(404).json({error:"Visita não encontrada."});
    const old=legacySnap.val();if(!(await canAccessVisit(req,old)))return res.status(403).json({error:"Visita fora da sua carteira ou equipe."});
    const mapped=({pendente:"pendente",confirmada:"confirmado",recusada:"recusado",realizada:"concluido",cliente_faltou:"recusado",proposta_apresentada:"concluido"})[status];
    await legacyRef.update({status:mapped,statusOperacional:status,atualizadoEm:new Date().toISOString()});return res.json({ok:true});
  }catch(e){return sendServerError(res,"Não foi possível atualizar a visita.",e);}
});

// Central de notificações do usuário autenticado.
app.get("/api/notificacoes", requireFirebase, async (req,res) => {
  try {
    const snap = await db.ref("notificacoes/" + req.user.uid).get();
    const items = Object.entries(snap.val() || {}).map(([id,item]) => ({id,...item})).sort((a,b) => String(b.criadoEm||"").localeCompare(String(a.criadoEm||""))).slice(0,50);
    return res.json({items, naoLidas:items.filter(item=>!item.lida).length});
  } catch(error) { return sendServerError(res,"Não foi possível carregar as notificações.",error); }
});
app.patch("/api/notificacoes/:id/lida", requireFirebase, async (req,res) => {
  const id=cleanString(req.params.id,128);
  if(!id||id.includes("/")) return res.status(400).json({error:"Notificação inválida."});
  try { const ref=db.ref("notificacoes/"+req.user.uid+"/"+id); if(!(await ref.get()).exists()) return res.status(404).json({error:"Notificação não encontrada."}); await ref.update({lida:true,lidaEm:new Date().toISOString()}); return res.json({ok:true}); }
  catch(error) { return sendServerError(res,"Não foi possível atualizar a notificação.",error); }
});
/* CRM OPERACIONAL */
const crmStages = new Set(["novo","em_contato","visita_agendada","proposta_enviada","em_analise_contrato","fechado","perdido"]);
async function canAccessLead(req, lead) {
  if (req.profile.papel === "administrador" || lead.responsavelUid === req.user.uid) return true;
  if (req.profile.papel !== "gerente" || !lead.responsavelUid) return false;
  const broker = (await db.ref("usuarios/" + lead.responsavelUid).get()).val();
  return broker?.papel === "corretor" && broker?.gerenteUid === req.user.uid;
}
app.get("/api/crm/leads", requireFirebase, allowRoles("administrador","corretor","gerente"), async (req,res) => {
  try { const snap=await db.ref("leads").get(); let items=Object.entries(snap.val()||{}).map(([id,v])=>({id,...v})); if(req.profile.papel==="corretor")items=items.filter(x=>x.responsavelUid===req.user.uid); if(req.profile.papel==="gerente"){const snapUsers=await db.ref("usuarios").get();const team=new Set(Object.entries(snapUsers.val()||{}).filter(([,u])=>u.papel==="corretor"&&u.gerenteUid===req.user.uid).map(([uid])=>uid));items=items.filter(x=>team.has(x.responsavelUid));} items.sort((a,b)=>String(b.atualizadoEm||b.criadoEm||"").localeCompare(String(a.atualizadoEm||a.criadoEm||""))); return res.json({items}); }
  catch(e){return sendServerError(res,"Não foi possível carregar os leads.",e);}
});
app.post("/api/crm/leads", requireFirebase, allowRoles("administrador","corretor"), async(req,res)=>{
  const b=req.body||{},nome=cleanString(b.nome,120),telefone=cleanString(b.telefone,40); if(!nome||!telefone)return res.status(400).json({error:"Nome e telefone são obrigatórios."});
  const status=crmStages.has(b.status)?b.status:"novo",responsavelUid=req.profile.papel==="administrador"&&isValidUid(b.responsavelUid)?b.responsavelUid:req.user.uid;
  try{const ref=db.ref("leads").push(),now=new Date().toISOString(),lead={nome,telefone,email:cleanString(b.email,160),imovelId:cleanString(b.imovelId,120),preferencias:cleanString(b.preferencias,3000),mensagem:cleanString(b.mensagem,2000),status,proximoContato:cleanString(b.proximoContato,20),responsavelUid,origem:"manual",criadoEm:now,atualizadoEm:now,historico:[{texto:"Lead cadastrado manualmente.",autorUid:req.user.uid,autorNome:cleanString(req.profile.nome,120),data:now}]};await ref.set(lead);return res.status(201).json({ok:true,id:ref.key});}
  catch(e){return sendServerError(res,"Não foi possível cadastrar o lead.",e);}
});
app.patch("/api/crm/leads/:id", requireFirebase, allowRoles("administrador","corretor","gerente"), async(req,res)=>{
  const id=cleanString(req.params.id,128),b=req.body||{};if(!id||id.includes("/"))return res.status(400).json({error:"ID inválido."});const updates={};
  for(const [k,n] of [["nome",120],["telefone",40],["email",160],["imovelId",120],["preferencias",3000],["mensagem",2000],["proximoContato",20]])if(Object.hasOwn(b,k))updates[k]=cleanString(b[k],n);
  if(Object.hasOwn(b,"status")){if(!crmStages.has(b.status))return res.status(400).json({error:"Etapa inválida."});updates.status=b.status;}
  if(!Object.keys(updates).length)return res.status(400).json({error:"Nenhuma alteração informada."});
  if((updates.nome!==undefined&&!updates.nome)||(updates.telefone!==undefined&&!updates.telefone))return res.status(400).json({error:"Nome e telefone são obrigatórios."});
  try{const ref=db.ref("leads/"+id),snap=await ref.get();if(!snap.exists())return res.status(404).json({error:"Lead não encontrado."});if(!(await canAccessLead(req,snap.val())))return res.status(403).json({error:"Este lead não pertence à sua equipe ou carteira."});updates.atualizadoEm=new Date().toISOString();await ref.update(updates);return res.json({ok:true,id});}
  catch(e){return sendServerError(res,"Não foi possível atualizar o lead.",e);}
});
app.post("/api/crm/leads/:id/interacoes", requireFirebase, allowRoles("administrador","corretor","gerente"), async(req,res)=>{
  const id=cleanString(req.params.id,128),texto=cleanString(req.body?.texto,2000);if(!id||id.includes("/")||!texto)return res.status(400).json({error:"Informe uma interação válida."});
  try{const ref=db.ref("leads/"+id),snap=await ref.get();if(!snap.exists())return res.status(404).json({error:"Lead não encontrado."});if(!(await canAccessLead(req,snap.val())))return res.status(403).json({error:"Este lead não pertence à sua equipe ou carteira."});const now=new Date().toISOString();await ref.child("historico").push({texto,autorUid:req.user.uid,autorNome:cleanString(req.profile.nome,120),data:now});await ref.update({atualizadoEm:now});return res.status(201).json({ok:true});}
  catch(e){return sendServerError(res,"Não foi possível registrar a interação.",e);}
});

// --------------------------------------------------
// TRATAMENTO DE ERROS
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: "Upload inválido ou arquivo acima do limite permitido.",
    });
  }

  console.error("Erro na requisição:", err.stack || err.message || err);

  return res.status(400).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Requisição inválida."
        : err.message || "Requisição inválida.",
  });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `R&D PRIME IMÓVEIS disponível em http://localhost:${PORT}`
  );

  if (!auth || !db) {
    console.error(
      "ATENÇÃO: Firebase Admin não está disponível. " +
      "APIs que dependem do Firebase falharão."
    );
  } else {
    console.log(
      "Firebase Admin e Realtime Database prontos."
    );
  }
});