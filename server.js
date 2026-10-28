
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
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:"
        ],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://*.firebasedatabase.app",
          "https://*.firebaseapp.com",
          "https://securetoken.googleapis.com"
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null
      }
    }
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
    legacyHeaders: false
  })
);

// Arquivos públicos do frontend
app.use(express.static(FRONTEND_DIR));

// Fotos dos imóveis
app.use(
  "/uploads/imoveis",
  express.static(UPLOAD_ROOT, {
    dotfiles: "deny",
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
  })
);

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
    // Local: GOOGLE_APPLICATION_CREDENTIALS aponta para o JSON da conta de serviço.
    // Render: use FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.
    let credential;
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountBase64) {
      const decoded = Buffer.from(serviceAccountBase64, "base64").toString("utf8");
      credential = admin.credential.cert(JSON.parse(decoded));
    } else if (serviceAccountJson) {
      credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } else {
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ||
        "https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com"
    });
  }

  db = admin.database();
  auth = admin.auth();

  console.log("Firebase Admin inicializado.");

} catch (error) {
  firebaseAdminError = error;

  console.error(
    "ERRO AO INICIALIZAR O FIREBASE ADMIN:",
    error.stack || error.message
  );
}

function firebaseUnavailable(res) {
  const details =
    firebaseAdminError?.message ||
    "Verifique as credenciais do Firebase Admin.";

  return res.status(503).json({
    error: "Firebase Admin indisponível no servidor.",
    ...(process.env.NODE_ENV !== "production" ? { details } : {})
  });
}

// --------------------------------------------------
// FUNÇÕES AUXILIARES
// --------------------------------------------------

function cleanString(value, max = 3000) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
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
    error: message
  });
}

const allowedCategories = new Set([
  "residencial",
  "comercial",
  "sublocacao",
  "garagem",
  "lancamento"
]);

const allowedPurposes = new Set([
  "venda",
  "locacao",
  "temporada"
]);

const allowedPropertyStatuses = new Set([
  "rascunho",
  "aguardando_aprovacao",
  "publicado",
  "reservado",
  "vendido",
  "alugado",
  "inativo"
]);

const allowedUserRoles = new Set([
  "cliente",
  "corretor",
  "administrador"
]);

// --------------------------------------------------
// SAÚDE DO SERVIDOR
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "rd-prime-imoveis",
    firebaseAdminConfigured: Boolean(auth && db)
  });
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
      error: "Token de autenticação não enviado."
    });
  }

  let decoded;

  // Primeiro, validar o token separadamente.
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (error) {
    console.error(
      "Token inválido no cadastro:",
      error.message
    );

    return res.status(401).json({
      error: "Sessão inválida. Entre novamente e tente cadastrar."
    });
  }

  const nome = cleanString(req.body?.nome, 120);
  const telefone = cleanString(req.body?.telefone, 30);
  // A pessoa pode solicitar cadastro como corretor, mas nunca recebe
  // o papel de corretor automaticamente. A aprovação é feita pelo admin.
  const solicitacaoPapel = req.body?.tipoCadastro === "corretor" ? "corretor" : "cliente";

  if (!nome || !telefone) {
    return res.status(400).json({
      error: "Nome e telefone são obrigatórios."
    });
  }

  try {
    const userRecord = await auth.getUser(decoded.uid);
    const userRef = db.ref(`usuarios/${decoded.uid}`);

    const existing = await userRef.get();

    if (existing.exists()) {
      return res.status(409).json({
        error: "Já existe um perfil para esta conta. Procure o administrador."
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
      criadoEm: new Date().toISOString()
    };

    await userRef.set(profile);

    return res.status(201).json({
      ok: true,
      papel: "cliente",
      solicitacaoPapel,
      ativo: true,
      status: "ativo",
      message: "Cadastro de cliente concluído com sucesso."
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

// Autentica o usuário e carrega o perfil, mesmo se estiver pendente.
// Usado para que a tela de login consiga identificar o estado da aprovação.
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
    if (error?.code === "auth/id-token-expired" || error?.code === "auth/argument-error" || error?.code === "auth/id-token-revoked") {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    return sendServerError(res, "Não foi possível validar a sessão e consultar o perfil.", error);
  }
}

// Mantém a proteção de todas as rotas privadas: perfil ativo é obrigatório.
function requireFirebase(req, res, next) {
  return requireAuthenticated(req, res, () => {
    if (!req.profile) {
      return res.status(403).json({ error: "Perfil não cadastrado. Complete o cadastro e aguarde a aprovação." });
    }
    if (req.profile.ativo !== true || req.profile.status !== "ativo") {
      return res.status(403).json({ error: "Seu acesso está pendente ou inativo." });
    }
    return next();
  });
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (
      !req.profile ||
      !roles.includes(req.profile.papel)
    ) {
      return res.status(403).json({
        error: "Você não tem permissão para esta operação."
      });
    }

    return next();
  };
}

// Retorna o perfil mesmo quando pendente, para o frontend decidir
// entre dashboard, solicitação pendente ou pedido de cadastro.
app.get("/api/auth/perfil", requireAuthenticated, (req, res) => {
  return res.json({
    perfil: req.profile,
    autenticado: true,
    aprovado: req.profile?.ativo === true && req.profile?.status === "ativo"
  });
});

// --------------------------------------------------
// ADMINISTRAÇÃO DE USUÁRIOS
// Apenas administrador ativo pode listar e alterar.
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
        ...user
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
      return res.status(400).json({
        error: "UID inválido."
      });
    }

    if (Object.hasOwn(body, "papel")) {
      if (!allowedUserRoles.has(body.papel)) {
        return res.status(400).json({
          error: "Perfil inválido."
        });
      }

      updates.papel = body.papel;
    }

    if (Object.hasOwn(body, "ativo")) {
      if (typeof body.ativo !== "boolean") {
        return res.status(400).json({
          error: "O campo ativo deve ser verdadeiro ou falso."
        });
      }

      updates.ativo = body.ativo;
      updates.status = body.ativo ? "ativo" : "inativo";
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Informe um perfil e/ou status para atualizar."
      });
    }

    if (uid === req.user.uid && updates.ativo === false) {
      return res.status(400).json({
        error: "Você não pode desativar sua própria conta."
      });
    }

    if (
      uid === req.user.uid &&
      updates.papel &&
      updates.papel !== "administrador"
    ) {
      return res.status(400).json({
        error: "Você não pode remover seu próprio perfil de administrador."
      });
    }

    try {
      const userRef = db.ref(`usuarios/${uid}`);
      const snapshot = await userRef.get();

      if (!snapshot.exists()) {
        return res.status(404).json({
          error: "Usuário não encontrado."
        });
      }

      updates.atualizadoEm = new Date().toISOString();

      await userRef.update(updates);

      return res.json({
        ok: true,
        uid,
        updates
      });

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
// Somente administradores ativos podem consultar todos os dados.
// --------------------------------------------------

app.get(
  "/api/admin/dashboard",
  requireFirebase,
  allowRoles("administrador"),
  async (_req, res) => {
    try {
      const [propertiesSnapshot, usersSnapshot, leadsSnapshot] = await Promise.all([
        db.ref("imoveis").get(),
        db.ref("usuarios").get(),
        db.ref("leads").get()
      ]);

      const propertiesRaw = propertiesSnapshot.val() || {};
      const usersRaw = usersSnapshot.val() || {};
      const leadsRaw = leadsSnapshot.val() || {};

      const imoveis = Object.entries(propertiesRaw).map(([id, item]) => ({
        id,
        ...item
      }));

      const usuarios = Object.entries(usersRaw).map(([uid, item]) => ({
        uid,
        ...item
      }));

      const leads = Object.entries(leadsRaw).map(([id, item]) => ({
        id,
        ...item
      }));

      const publicados = imoveis.filter(item =>
        item.status === "publicado" && item.publicadoNoSite === true
      );

      const pendentes = imoveis.filter(item =>
        item.status === "aguardando_aprovacao"
      );

      const clientes = usuarios.filter(item => item.papel === "cliente");
      const corretores = usuarios.filter(item =>
        item.papel === "corretor" && item.ativo === true && item.status === "ativo"
      );

      const leadsNovos = leads.filter(item =>
        !item.status || item.status === "novo"
      );

      return res.json({
        resumo: {
          totalImoveis: imoveis.length,
          publicados: publicados.length,
          pendentes: pendentes.length,
          inativos: imoveis.filter(item => item.status === "inativo").length,
          venda: imoveis.filter(item => item.finalidade === "venda").length,
          locacao: imoveis.filter(item => item.finalidade === "locacao").length,
          temporada: imoveis.filter(item => item.finalidade === "temporada").length,
          totalUsuarios: usuarios.length,
          clientes: clientes.length,
          corretores: corretores.length,
          leads: leads.length,
          leadsNovos: leadsNovos.length
        },
        imoveis: imoveis.sort((a, b) =>
          String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))
        ),
        usuarios: usuarios.sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
        ),
        leads: leads.sort((a, b) =>
          String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))
        ).slice(0, 100)
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
// IMÓVEIS PÚBLICOS
// --------------------------------------------------

app.get("/api/imoveis", async (_req, res) => {
  if (!db) {
    return firebaseUnavailable(res);
  }

  try {
    const snapshot = await db.ref("imoveis").get();
    const all = snapshot.val() || {};

    const items = Object.entries(all)
      .map(([id, value]) => ({ id, ...value }))
      .filter(item =>
        item.status === "publicado" &&
        item.publicadoNoSite === true
      );

    return res.json({ items });

  } catch (error) {
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
      error: "ID de imóvel inválido."
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
        error: "Imóvel não encontrado."
      });
    }

    return res.json({
      item: { id, ...item }
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
      error: "Informe nome e telefone."
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
      criadoEm: new Date().toISOString()
    });

    return res.status(201).json({
      ok: true,
      id: leadRef.key
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
    const id = cleanString(req.params.id, 100)
      .replace(/[^a-zA-Z0-9_-]/g, "");

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
      "image/webp": ".webp"
    };

    const ext = extensions[file.mimetype];

    if (!ext) {
      return cb(new Error("Formato de imagem não permitido."));
    }

    const filename =
      `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;

    return cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 12) * 1024 * 1024,
    files: 20
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Envie somente imagens JPG, PNG ou WEBP."));
    }

    return cb(null, true);
  }
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
        error: "ID de imóvel inválido."
      });
    }

    try {
      const ref = db.ref(`imoveis/${id}`);
      const snapshot = await ref.get();

      if (!snapshot.exists()) {
        return res.status(404).json({
          error: "Imóvel não encontrado."
        });
      }

      const property = snapshot.val();

      if (
        req.profile.papel === "corretor" &&
        property.responsavelUid !== req.user.uid
      ) {
        return res.status(403).json({
          error: "Você só pode alterar fotos dos imóveis da sua carteira."
        });
      }

      const novasFotos = (req.files || []).map(file =>
        `/uploads/imoveis/${id}/${path.basename(file.filename)}`
      );

      const antigas = Array.isArray(property.fotos)
        ? property.fotos
        : [];

      const fotos = [...antigas, ...novasFotos];

      await ref.update({
        fotos,
        atualizadoEm: new Date().toISOString()
      });

      return res.status(201).json({ fotos });

    } catch (error) {
      return sendServerError(
        res,
        "Falha ao salvar fotos.",
        error
      );
    }
  }
);

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
        error: "Título, categoria e finalidade válidos são obrigatórios."
      });
    }

    const precoInformado =
      body.preco !== undefined &&
      body.preco !== null &&
      body.preco !== "";

    const preco = precoInformado ? Number(body.preco) : null;

    if (
      precoInformado &&
      (!Number.isFinite(preco) || preco < 0)
    ) {
      return res.status(400).json({
        error: "Preço inválido."
      });
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
        status,
        publicadoNoSite: status === "publicado",
        responsavelUid: req.user.uid,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };

      await ref.set(item);

      return res.status(201).json({
        id: ref.key,
        item
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
      "aguardando_aprovacao"
    ];

    if (!id || id.includes("/")) {
      return res.status(400).json({
        error: "ID de imóvel inválido."
      });
    }

    if (
      !allowedPropertyStatuses.has(status) ||
      !allowedApprovalStatuses.includes(status)
    ) {
      return res.status(400).json({
        error: "Status inválido."
      });
    }

    try {
      const ref = db.ref(`imoveis/${id}`);
      const snapshot = await ref.get();

      if (!snapshot.exists()) {
        return res.status(404).json({
          error: "Imóvel não encontrado."
        });
      }

      await ref.update({
        status,
        publicadoNoSite: status === "publicado",
        atualizadoEm: new Date().toISOString()
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
// TRATAMENTO DE ERROS
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: "Upload inválido ou arquivo acima do limite permitido."
    });
  }

  console.error(
    "Erro na requisição:",
    err.stack || err.message || err
  );

  return res.status(400).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Requisição inválida."
        : err.message || "Requisição inválida."
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
      "ATENÇÃO: Firebase Admin não está disponível. APIs que dependem do Firebase falharão."
    );
  }
});
