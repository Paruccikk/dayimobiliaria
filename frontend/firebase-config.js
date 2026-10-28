// ============================================
// R&D PRIME — Firebase Web SDK Config
// Client-side (não é segredo — apenas identificação)
// ============================================

import {
  initializeApp,
  getApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ---------- Configuração ---------- */

export const firebaseConfig = {
  apiKey: "AIzaSyCteHYBI5mouYeQxAIeRB1NDMLZSjDvX_8",
  authDomain: "rdprimeimoveis-46b2f.firebaseapp.com",
  databaseURL: "https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com",
  projectId: "rdprimeimoveis-46b2f",
  storageBucket: "rdprimeimoveis-46b2f.firebasestorage.app",
  messagingSenderId: "219107441361",
  appId: "1:219107441361:web:ec2497a46521c5c5c9e3f0",
};

/* ---------- Inicialização segura ---------- */

let appInstance;

try {
  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
} catch (err) {
  console.error("[Firebase] Falha ao inicializar o app:", err);
  // Re-tentativa limpa (caso já exista app parcial)
  appInstance = initializeApp(firebaseConfig, "rd-prime-fallback");
}

/* ---------- Exports ---------- */

export const app = appInstance;
export const auth = getAuth(app);
export const database = getDatabase(app);

/* Alias curto (compatibilidade com código existente) */
export const db = database;

/* Utilitário útil para outras páginas */
export const DATABASE_URL = firebaseConfig.databaseURL;

/* Marca no console que o SDK carregou */
if (typeof window !== "undefined") {
  window.__RD_PRIME_FIREBASE__ = { app, auth, database };
}

export default app;
