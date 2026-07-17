import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, ref, set, get, push, update, remove, onValue, query, orderByChild, equalTo } from "firebase/database";
import { getStorage } from "firebase/storage";

// Debug: Verificar variáveis de ambiente
const debugEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? '✓ Definido' : '✗ Não definido',
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '✗ Não definido',
  VITE_FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '✗ Não definido',
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || '✗ Não definido',
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '✗ Não definido',
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '✗ Não definido',
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID || '✗ Não definido',
};

console.log('🔥 [Firebase] Variáveis de Ambiente:', debugEnv);

// Validar variáveis críticas
const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
];

const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ [Firebase] Variáveis de ambiente FALTANDO:', missingVars);
  console.error('⚠️ [Firebase] O app não funcionará sem essas variáveis. Verifique o Vercel Settings → Environment Variables');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

console.log('🔥 [Firebase] Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
});

// Check if any Firebase apps are already initialized to prevent errors during Hot Module Replacement (HMR)
// Inicialização única do App
let app, firestore, auth, database, storage;

try {
  const apps = getApps();
  app = apps.length === 0 ? initializeApp(firebaseConfig) : getApp();
  console.log("✓ [Firebase] App inicializado:", firebaseConfig.projectId);

  // Inicialização estável do Firestore para evitar "Unexpected state" com HMR
  firestore = getFirestore(app);
  
  auth = getAuth(app);
  database = getDatabase(app);
  storage = getStorage(app);

  setPersistence(auth, browserLocalPersistence).catch(console.error);

  console.log("✓ [Firebase] Todos os serviços inicializados com sucesso");
} catch (error) {
  console.error("❌ [Firebase] Erro ao inicializar:", error.message);
  console.error("⚠️ O app não conseguiu conectar ao Firebase. Verifique as variáveis de ambiente no Vercel.");
}

// Auxiliares de Autenticação
const googleProvider = new GoogleAuthProvider();
const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
const logout = () => signOut(auth);
const onAuthChange = (callback) => onAuthStateChanged(auth, callback);
export { createUserWithEmailAndPassword };

const db = database; // Alias para compatibilidade entre os arquivos database.js

// Helper seguro para garantir que o banco de dados está disponível antes de tentar acessá-lo
const getSafeRef = (path) => {
  if (!db) {
    throw new Error("O serviço Realtime Database não está disponível. Verifique se a VITE_FIREBASE_DATABASE_URL está correta no arquivo .env e se não há duplicidade de node_modules.");
  }
  return ref(db, path);
};

const dbSet = (path, data) => set(getSafeRef(path), data);
const dbPush = (path, data) => push(getSafeRef(path), data);
const dbGet = async (path) => {
  const snapshot = await get(getSafeRef(path));
  return snapshot.exists() ? snapshot.val() : null;
};
const dbUpdate = (path, data) => update(getSafeRef(path), data);
const dbRemove = (path) => remove(getSafeRef(path));
const dbOnValue = (path, callback) => onValue(getSafeRef(path), (snapshot) => {
  callback(snapshot.exists() ? snapshot.val() : null);
});

// Exportação para manter compatibilidade com serviços antigos
export { dbGet, dbOnValue };

export { 
  app, auth, firestore, db, database, storage,
  ref, set, get, onValue, query, orderByChild, equalTo,
  dbSet, dbPush, dbUpdate, dbRemove, getSafeRef,
  loginWithGoogle, logout, onAuthChange, signInWithEmailAndPassword
};

export default app;