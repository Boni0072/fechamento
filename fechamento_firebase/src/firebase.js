import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, get, push, update, remove, onValue, query, orderByChild, equalTo } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inicialização com tratamento de erro básico
let app;
let auth;
let db;
let googleProvider;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  googleProvider = new GoogleAuthProvider();
} catch (error) {
  console.error("Erro CRÍTICO ao inicializar Firebase:", error);
}

export { app, auth, db, googleProvider };

// Auth functions
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// Database helper functions
export const dbRef = (path) => ref(db, path);
export const dbSet = (path, data) => set(ref(db, path), data);
export const dbGet = async (path) => {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
};
export const dbPush = (path, data) => push(ref(db, path), data);
export const dbUpdate = (path, data) => update(ref(db, path), data);
export const dbRemove = (path) => remove(ref(db, path));
export const dbOnValue = (path, callback) => onValue(ref(db, path), (snapshot) => {
  callback(snapshot.exists() ? snapshot.val() : null);
});

export { ref, set, get, push, update, remove, onValue, query, orderByChild, equalTo };