
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCteHYBI5mouYeQxAIeRB1NDMLZSjDvX_8",
  authDomain: "rdprimeimoveis-46b2f.firebaseapp.com",
  databaseURL: "https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com",
  projectId: "rdprimeimoveis-46b2f",
  storageBucket: "rdprimeimoveis-46b2f.firebasestorage.app",
  messagingSenderId: "219107441361",
  appId: "1:219107441361:web:ec2497a46521c5c5c9e3f0"
};

export const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);

export const db = database;

export default app;
