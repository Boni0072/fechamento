// Importe as funções necessárias
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import 'dotenv/config'; // Carrega as variáveis do .env

// A mesma configuração do seu app
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

console.log("--- INICIANDO TESTE DE CONEXÃO FIREBASE ---");
console.log("URL do Banco de Dados:", firebaseConfig.databaseURL);

// Validação rápida
if (!firebaseConfig.databaseURL || !firebaseConfig.apiKey) {
  console.error("\nERRO: VITE_FIREBASE_DATABASE_URL ou VITE_FIREBASE_API_KEY não encontradas.");
  console.error("Verifique se o arquivo .env está na raiz do projeto e se as variáveis estão corretas.");
  process.exit(1);
}

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Tenta escrever um valor no banco de dados
async function testWrite() {
  try {
    const testRef = ref(db, 'test-connection');
    console.log("\nTentando escrever em /test-connection...");
    
    await set(testRef, {
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    
    console.log("\n✅ SUCESSO! A conexão com o Firebase Realtime Database funcionou e os dados foram escritos.");
    console.log("Isso confirma que suas credenciais, URL e regras de segurança estão funcionando fora do Vite.");

  } catch (error) {
    console.error("\n❌ FALHA! Não foi possível escrever no banco de dados.");
    console.error("Erro Detalhado:", error.message);
    console.error("\nPossíveis causas:");
    console.error("1. A 'databaseURL' no arquivo .env está incorreta.");
    console.error("2. As Regras de Segurança do Realtime Database estão bloqueando a escrita (verifique se .write é true ou 'auth != null').");
    console.error("3. Um firewall, antivírus ou proxy está bloqueando a conexão com *.firebaseio.com.");
    console.error("4. A API Key ou outras credenciais estão incorretas.");
  }
}

testWrite();
