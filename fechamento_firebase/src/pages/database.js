import { ref, onValue, push, set, update, remove, get, off } from 'firebase/database';
import { database } from './firebase';

/**
 * Referências do Banco de Dados
 * Estrutura:
 * - empresas/
 *   - {empresaId}/
 *     - etapas/
 *     - membros/
 */

// --- ETAPAS (Substitui as linhas da planilha) ---

/**
 * Escuta as etapas de uma empresa em tempo real
 * @param {string} empresaId 
 * @param {function} callback Função chamada quando os dados mudam
 * @returns {function} Função para cancelar a inscrição (unsubscribe)
 */
export const subscribeToEtapas = (empresaId, callback) => {
  if (!empresaId) return () => {};
  
  const etapasRef = ref(database, `empresas/${empresaId}/etapas`);
  
  const unsubscribe = onValue(etapasRef, (snapshot) => {
    const data = snapshot.val();
    const etapasList = data ? Object.entries(data).map(([key, value]) => ({
      id: key,
      ...value
    })) : [];
    
    callback(etapasList);
  });

  return () => off(etapasRef, 'value', unsubscribe);
};

/**
 * Adiciona uma nova etapa
 */
export const addEtapa = async (empresaId, etapaData) => {
  const etapasRef = ref(database, `empresas/${empresaId}/etapas`);
  const newEtapaRef = push(etapasRef);
  
  await set(newEtapaRef, {
    ...etapaData,
    createdAt: new Date().toISOString(),
    status: etapaData.status || 'pendente'
  });
  
  return newEtapaRef.key;
};

/**
 * Atualiza uma etapa existente
 */
export const updateEtapa = async (empresaId, etapaId, updates) => {
  const etapaRef = ref(database, `empresas/${empresaId}/etapas/${etapaId}`);
  await update(etapaRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
};

/**
 * Remove uma etapa
 */
export const deleteEtapa = async (empresaId, etapaId) => {
  const etapaRef = ref(database, `empresas/${empresaId}/etapas/${etapaId}`);
  await remove(etapaRef);
};

/**
 * Importação em massa (Substitui a importação de Excel para Planilha Google)
 * Agora salva direto no Firebase
 */
export const importEtapasBatch = async (empresaId, etapasArray) => {
  const updates = {};
  const etapasRef = ref(database, `empresas/${empresaId}/etapas`);
  
  etapasArray.forEach(etapa => {
    const newKey = push(etapasRef).key;
    updates[`empresas/${empresaId}/etapas/${newKey}`] = {
      ...etapa,
      createdAt: new Date().toISOString(),
      imported: true
    };
  });

  await update(ref(database), updates);
};

// --- EMPRESAS E USUÁRIOS ---

/**
 * Cria ou atualiza dados da empresa
 */
export const saveEmpresa = async (empresaId, dados) => {
  const empresaRef = ref(database, `empresas/${empresaId}`);
  await update(empresaRef, dados);
};

/**
 * Busca dados de uma empresa uma única vez
 */
export const getEmpresa = async (empresaId) => {
  const snapshot = await get(ref(database, `empresas/${empresaId}`));
  return snapshot.exists() ? snapshot.val() : null;
};

/**
 * Salva dados do perfil do usuário
 */
export const saveUserProfile = async (uid, userData) => {
  const userRef = ref(database, `users/${uid}`);
  await update(userRef, userData);
};

/**
 * Busca perfil do usuário
 */
export const getUserProfile = async (uid) => {
  const snapshot = await get(ref(database, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
};