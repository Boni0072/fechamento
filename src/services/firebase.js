// Centralizando inicialização para evitar o erro de inicialização múltipla do Firestore.
// Este arquivo agora apenas re-exporta as instâncias centralizadas de src/firebase.js.
export * from '../firebase';
