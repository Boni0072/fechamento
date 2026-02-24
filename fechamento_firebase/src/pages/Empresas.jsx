import { useState, useEffect } from 'react';
import { getFirestore, doc, updateDoc, setDoc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';
import { getDatabase, ref, set } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { checkPermission } from './permissionUtils';
import { Plus, Building2, Check, FileSpreadsheet, RefreshCw, Trash2, Pencil, Palette, Upload, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Empresas() {
  const { empresas, empresaAtual, selecionarEmpresa, criarEmpresa, user } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('empresas');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : authUser);
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);


  const [showModal, setShowModal] = useState(false);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [empresaEditando, setEmpresaEditando] = useState(null);
  const [error, setError] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configEmpresa, setConfigEmpresa] = useState(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetData, setSheetData] = useState([]);
  const [fullSheetData, setFullSheetData] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [currentWorkbook, setCurrentWorkbook] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  // Estados para Configuração de Aparência
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [selectedEmpresaAppearance, setSelectedEmpresaAppearance] = useState(null);
  const [appearanceConfig, setAppearanceConfig] = useState({
    sidebarColor: '#111827',
    sidebarTextColor: '#ffffff',
    primaryColor: '#ea580c',
    fontSize: 'normal',
    logo: ''
  });

  // Função auxiliar para redimensionar imagem (Logo)
  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 200;
          const MAX_HEIGHT = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const formatSheetDate = (cell) => {
    // Se a célula estiver vazia, retorna uma string vazia.
    if (cell === null || cell === undefined || cell === '') {
      return '';
    }

    // Se já for uma string com formato de data (ex: "13/12/2025"), retorna como está.
    if (typeof cell === 'string' && cell.includes('/')) {
      return cell;
    }

    const numericValue = Number(cell);

    // Se não for um número ou for um valor que não representa uma data válida, retorna o valor original.
    if (isNaN(numericValue) || numericValue <= 1) {
      return cell;
    }

    try {
      // O número serial do Excel representa o número de dias desde 1900-01-01.
      // O JavaScript Date usa milissegundos desde 1970-01-01 (época Unix).
      // A diferença é de 25569 dias (considerando o bug do ano bissexto de 1900 no Excel).
      const date = new Date((numericValue - 25569) * 86400 * 1000);
      
      // getUTCDate, getUTCMonth, getUTCFullYear para evitar problemas de fuso horário
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é base 0
      const year = date.getUTCFullYear();

      // Validação simples para garantir que a data é razoável
      if (year > 1900 && year < 2100) {
        return `${day}/${month}/${year}`;
      }
    } catch (e) {
      console.error("Erro ao converter data da planilha:", cell, e);
    }

    // Como fallback, retorna o valor original se a conversão falhar.
    return cell;
  };

  // Listener para manter o modal atualizado em tempo real (corrige bug de "perda de conexão" ao salvar)
  // MOVIDO PARA O TOPO para evitar erro de "Rendered more hooks"
  useEffect(() => {
    if (showConfigModal && configEmpresa?.id) {
      const db = getFirestore();
      const empresaRef = doc(db, 'tenants', configEmpresa.id);
      
      const unsubscribe = onSnapshot(empresaRef, (snapshot) => {
        const data = snapshot.data();
        if (data) {
          setConfigEmpresa(prev => ({ ...prev, ...data }));
          setSpreadsheetId(data.spreadsheetId || '');
          setSelectedSheet(data.sheetName || '');
          
          if (data.tabelaGoogle && Array.isArray(data.tabelaGoogle)) {
            setFullSheetData(data.tabelaGoogle);
            const headers = Object.keys(data.tabelaGoogle[0] || {});
            const rows = data.tabelaGoogle.slice(0, 5).map(item => headers.map(h => item[h]));
            setSheetData([headers, ...rows]);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [showConfigModal, configEmpresa?.id]);

  const handleSalvar = async (e) => {
    e.preventDefault();
    
    if (!nome.trim()) {
      setError('O nome da empresa é obrigatório');
      return;
    }

    if (!empresaEditando && typeof criarEmpresa !== 'function') {
      setError('Erro: Função de criar empresa não disponível.');
      return;
    }

    if (!navigator.onLine) {
      setError('Você está offline. Verifique sua conexão com a internet.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      if (empresaEditando) {
        // Lógica de Edição
        const db = getFirestore();
        await updateDoc(doc(db, 'tenants', empresaEditando.id), {
          nome: nome.trim(),
          cnpj: cnpj.trim()
        });
      } else {
        // Lógica de Criação
        const dadosNovaEmpresa = { nome: nome.trim(), cnpj: cnpj.trim() };
        console.log("Payload enviado para criarEmpresa:", JSON.stringify(dadosNovaEmpresa, null, 2));
        
        // Adiciona um timeout de 15 segundos para evitar que o app trave se o banco não responder
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Tempo limite excedido (15s). O Firebase Realtime Database não respondeu. Verifique a aba "Network" (Rede) do navegador (F12) para ver se há erros de conexão com o banco de dados.'));
          }, 15000);
        });

        await Promise.race([criarEmpresa(dadosNovaEmpresa), timeoutPromise]);
        console.log("Sucesso: A função criarEmpresa foi concluída. Fechando modal...");
      }
      
      setNome('');
      setCnpj('');
      setEmpresaEditando(null);
      setShowModal(false);
    } catch (err) {
      console.error("Falha ao salvar empresa:", err);
      // Exibe a mensagem real do erro (seja objeto Error ou string) para facilitar o diagnóstico
      const msg = (err && err.message) || (typeof err === 'string' ? err : 'Não foi possível criar a empresa.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEditEmpresa = (e, empresa) => {
    e.stopPropagation();
    setEmpresaEditando(empresa);
    setNome(empresa.nome);
    setCnpj(empresa.cnpj || '');
    setShowModal(true);
  };

  const handleDeleteEmpresa = async (e, empresa) => {
    e.stopPropagation();
    
    if (window.confirm(`Tem certeza que deseja excluir a empresa "${empresa.nome}"?\n\nEsta ação é IRREVERSÍVEL e apagará todos os dados associados.`)) {
      setLoading(true);
      try {
        const db = getFirestore();
        const rtdb = getDatabase();
        
        // Se estiver excluindo a empresa atual, limpa a seleção para evitar erros de visualização
        if (empresaAtual?.id === empresa.id) {
          selecionarEmpresa(null);
        }

        // 1. Remove do Firestore
        await deleteDoc(doc(db, 'tenants', empresa.id));
        
        // 2. Remove do Realtime Database (Cache)
        await set(ref(rtdb, `tenants/${empresa.id}`), null);
        
        // 3. Remove referência do usuário atual para atualizar a lista
        if (user?.id) {
            const userDirRef = doc(db, 'users_directory', user.id);
            const userDirSnap = await getDoc(userDirRef);
            if (userDirSnap.exists()) {
                const data = userDirSnap.data();
                const currentList = data.empresasAcesso || [];
                if (currentList.includes(empresa.id)) {
                    const newList = currentList.filter(id => id !== empresa.id);
                    await updateDoc(userDirRef, { empresasAcesso: newList });
                }
            }
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir empresa: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchDataFromGoogle = async (id) => {
    if (!id) return;
    setLoadingPreview(true);
    setError('');

    try {
      // Usa export?format=xlsx para obter todas as abas
      const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) {
        throw new Error('Não foi possível acessar a planilha. Verifique se o ID está correto e se a planilha está compartilhada como "Qualquer pessoa com o link".');
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      
      if (workbook.SheetNames.length === 0) throw new Error('A planilha parece estar vazia.');

      setSheetNames(workbook.SheetNames);
      setCurrentWorkbook(workbook);

      // Define a aba selecionada (ou a primeira se não houver seleção válida)
      let sheetToShow = selectedSheet;
      if (!sheetToShow || !workbook.SheetNames.includes(sheetToShow)) {
        sheetToShow = workbook.SheetNames[0];
        setSelectedSheet(sheetToShow);
      }

      const sheet = workbook.Sheets[sheetToShow];
      const dataArrays = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      const dataObjects = XLSX.utils.sheet_to_json(sheet, { raw: true });
      
      setSheetData(dataArrays);
      setFullSheetData(dataObjects);
    } catch (err) {
      console.error(err);
      setError('Erro ao sincronizar dados. Verifique o ID e as permissões da planilha.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSheetChange = (e) => {
    const newSheet = e.target.value;
    setSelectedSheet(newSheet);
    
    if (currentWorkbook) {
      const sheet = currentWorkbook.Sheets[newSheet];
      if (sheet) {
        const dataArrays = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
        const dataObjects = XLSX.utils.sheet_to_json(sheet, { raw: true });
        setSheetData(dataArrays);
        setFullSheetData(dataObjects);
      }
    }
  };

  const handleOpenConfig = (e, empresa) => {
    e.stopPropagation();
    setConfigEmpresa(empresa);
    const id = empresa.spreadsheetId || '';
    setSpreadsheetId(id);
    setSelectedSheet(empresa.sheetName || '');
    setSheetNames([]);
    setCurrentWorkbook(null);
    setShowConfigModal(true);

    // Carrega dados salvos inicialmente para feedback rápido
    if (empresa.tabelaGoogle && Array.isArray(empresa.tabelaGoogle) && empresa.tabelaGoogle.length > 0) {
      const headers = Object.keys(empresa.tabelaGoogle[0]);
      const rows = empresa.tabelaGoogle.map(item => headers.map(h => item[h]));
      setSheetData([headers, ...rows]);
      setFullSheetData(empresa.tabelaGoogle);
    } else {
      setSheetData([]);
      setFullSheetData([]);
    }

    // Busca dados atualizados automaticamente se houver ID
    if (id) {
      fetchDataFromGoogle(id);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!configEmpresa) return;
    
    setLoading(true);
    setError('');
    try {
      const db = getFirestore();
      
      let dadosTabela = fullSheetData;

      // Se o usuário salvou sem visualizar, busca os dados automaticamente
      if (dadosTabela.length === 0 && spreadsheetId) {
         try {
            // Adiciona timestamp para evitar cache e garantir dados frescos
            const sheetParam = selectedSheet ? `&sheet=${encodeURIComponent(selectedSheet)}` : '&gid=0';
            const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                const csvText = await response.text();
                const workbook = XLSX.read(csvText, { type: 'string' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                dadosTabela = XLSX.utils.sheet_to_json(sheet, { raw: true });
            }
         } catch (fetchError) {
            console.warn("Erro ao buscar dados automaticamente:", fetchError);
         }
      }

      // Processa os dados para garantir o formato correto
      const processedData = processData(dadosTabela);

      // Validação: Se tem ID mas não conseguiu dados, impede o salvamento e avisa
      if (spreadsheetId && (!processedData || processedData.length === 0)) {
        throw new Error('Não foi possível obter dados válidos da planilha. Verifique o ID e o nome das colunas.');
      }

      // 1. Salva apenas a CONFIGURAÇÃO no Firestore
      await setDoc(doc(db, 'tenants', configEmpresa.id), {
        spreadsheetId: spreadsheetId.trim(),
        sheetName: selectedSheet
      }, { merge: true });

      // 2. Salva os DADOS no Realtime Database (para leitura rápida nas outras telas)
      const rtdb = getDatabase();
      const tabelaRef = ref(rtdb, `tenants/${configEmpresa.id}/tabelaGoogle`);
      await set(tabelaRef, processedData);
      
      setShowConfigModal(false);
      setConfigEmpresa(null);
      setSpreadsheetId('');
      setSelectedSheet('');
      setFullSheetData([]);
      setSheetNames([]);
    } catch (err) {
      console.error("Erro ao salvar configuração:", err);
      setError(err.message || 'Erro ao salvar configuração.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    fetchDataFromGoogle(spreadsheetId);
  };

  const handleSync = async (e, empresa) => {
    e.stopPropagation();
    if (!empresa.spreadsheetId) return;
    
    setSyncingId(empresa.id);
    setError('');
    
    try {
      // Busca dados frescos do Google
      const sheetParam = empresa.sheetName ? `&sheet=${encodeURIComponent(empresa.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${empresa.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) throw new Error('Erro ao conectar com a planilha.');

      const csvText = await response.text();
      
      if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
        throw new Error('A planilha parece estar privada. Verifique o compartilhamento.');
      }

      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dadosTabela = XLSX.utils.sheet_to_json(sheet, { raw: true });
      const processedData = processData(dadosTabela);

      // Atualiza o cache no Realtime Database
      const rtdb = getDatabase();
      const tabelaRef = ref(rtdb, `tenants/${empresa.id}/tabelaGoogle`);
      await set(tabelaRef, processedData);
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(`Erro na sincronização: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async () => {
    if (!configEmpresa) return;
    if (!window.confirm('Tem certeza que deseja remover a conexão com a planilha Google?')) return;

    setLoading(true);
    setError('');
    try {
      const db = getFirestore();
      // Remove configuração do Firestore
      await setDoc(doc(db, 'tenants', configEmpresa.id), {
        spreadsheetId: null
      }, { merge: true });
      
      // Remove dados do Realtime Database
      const rtdb = getDatabase();
      const tabelaRef = ref(rtdb, `tenants/${configEmpresa.id}/tabelaGoogle`);
      await set(tabelaRef, null);
      
      setSpreadsheetId('');
      setSelectedSheet('');
      setSheetData([]);
      setFullSheetData([]);
      setShowConfigModal(false);
      setConfigEmpresa(null);
    } catch (err) {
      console.error("Erro ao desconectar:", err);
      setError(err.message || 'Erro ao desconectar planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAppearance = async (e, empresa) => {
    e.stopPropagation();
    setSelectedEmpresaAppearance(empresa);
    // 1. Define estado inicial com dados locais (para abrir rápido)
    setAppearanceConfig({
      sidebarColor: empresa.appearance?.sidebarColor || '#111827',
      sidebarTextColor: empresa.appearance?.sidebarTextColor || '#ffffff',
      primaryColor: empresa.appearance?.primaryColor || '#ea580c',
      fontSize: empresa.appearance?.fontSize || 'normal',
      logo: empresa.appearance?.logo || ''
    });
    setShowAppearanceModal(true);

    // 2. Busca dados frescos do Firestore para garantir que o modal mostre a versão mais recente
    try {
      const db = getFirestore();
      const docSnap = await getDoc(doc(db, 'tenants', empresa.id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const app = data.appearance || {};
        setAppearanceConfig({
          sidebarColor: app.sidebarColor || '#111827',
          sidebarTextColor: app.sidebarTextColor || '#ffffff',
          primaryColor: app.primaryColor || '#ea580c',
          fontSize: app.fontSize || 'normal',
          logo: app.logo || ''
        });
      }
    } catch (err) {
      console.error("Erro ao buscar dados atualizados da empresa:", err);
    }
  };

  const handleOpenGlobalAppearance = async () => {
    setSelectedEmpresaAppearance({ id: 'global', nome: 'Visão Consolidada' });
    const db = getFirestore();
    try {
        const docSnap = await getDoc(doc(db, 'system_settings', 'global_appearance'));
        const data = docSnap.exists() ? docSnap.data() : {};
        setAppearanceConfig({
          sidebarColor: data.sidebarColor || '#111827',
          sidebarTextColor: data.sidebarTextColor || '#ffffff',
          primaryColor: data.primaryColor || '#ea580c',
          fontSize: data.fontSize || 'normal',
          logo: data.logo || ''
        });
        setShowAppearanceModal(true);
    } catch (error) {
        console.error("Erro ao buscar aparência global:", error);
        // Fallback defaults
        setAppearanceConfig({ sidebarColor: '#111827', sidebarTextColor: '#ffffff', primaryColor: '#ea580c', fontSize: 'normal', logo: '' });
        setShowAppearanceModal(true);
    }
  };

  const handleSaveAppearance = async (e) => {
    e.preventDefault();
    if (!selectedEmpresaAppearance) return;
    setLoading(true);
    try {
      const db = getFirestore();
      
      if (selectedEmpresaAppearance.id === 'global') {
         await setDoc(doc(db, 'system_settings', 'global_appearance'), {
            ...appearanceConfig
         }, { merge: true });
      } else {
         // Usar setDoc com merge: true é mais robusto que updateDoc.
         await setDoc(doc(db, 'tenants', selectedEmpresaAppearance.id), {
           appearance: appearanceConfig
         }, { merge: true });
      }

      setShowAppearanceModal(false);
      setSelectedEmpresaAppearance(null);
    } catch (err) {
      console.error("Erro ao salvar aparência:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const resized = await resizeImage(file);
        setAppearanceConfig(prev => ({ ...prev, logo: resized }));
      } catch (err) {
        console.error("Erro ao processar imagem", err);
      }
    }
  };

  if (loadingPermissoes || (empresaAtual && (loadingProfile || (authUser && !userProfile)))) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Acesso não autorizado.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Empresas</h1>
            <p className="text-slate-500">Gerencie suas empresas e organizações</p>
          </div>
        </div>
        
        <div className="flex gap-2">
            <button
              onClick={handleOpenGlobalAppearance}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Palette className="w-4 h-4" />
              Aparência Consolidada
            </button>
            <button
              onClick={() => {
                setEmpresaEditando(null);
                setNome('');
                setCnpj('');
                setShowModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Nova Empresa
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {empresas.map(empresa => (
          <div
            key={empresa.id}
            onClick={() => selecionarEmpresa(empresa)}
            className={`bg-white rounded-xl shadow-sm p-6 cursor-pointer transition-all hover:shadow-md ${
              empresaAtual?.id === empresa.id ? 'ring-2 ring-primary-500' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden ${empresa.appearance?.logo ? 'bg-white' : 'bg-slate-50'}`}>
                  {empresa.appearance?.logo ? (
                    <img src={empresa.appearance.logo} alt={empresa.nome} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{empresa.nome}</h3>
                  {empresa.cnpj && <p className="text-sm text-slate-500">{empresa.cnpj}</p>}
                  <p className="text-xs text-slate-400 mt-1 font-mono" title="ID da Empresa">ID: {empresa.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleEditEmpresa(e, empresa)}
                  className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Editar Empresa"
                >
                  <Pencil className="w-5 h-5" />
                </button>

                <button
                  onClick={(e) => handleOpenAppearance(e, empresa)}
                  className="p-2 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                  title="Configurar Aparência"
                >
                  <Palette className="w-5 h-5" />
                </button>

                <button
                  onClick={(e) => handleDeleteEmpresa(e, empresa)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Excluir Empresa"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <button
                  onClick={(e) => handleSync(e, empresa)}
                  disabled={!empresa.spreadsheetId || syncingId === empresa.id}
                  className={`p-2 rounded-lg transition-colors ${
                    empresa.spreadsheetId 
                      ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                      : 'text-slate-300 cursor-not-allowed'
                  }`}
                  title={syncingId === empresa.id ? "Sincronizando..." : "Sincronizar dados agora"}
                >
                  <RefreshCw className={`w-5 h-5 ${syncingId === empresa.id ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={(e) => handleOpenConfig(e, empresa)}
                  className={`p-2 rounded-lg transition-colors ${
                    empresa.spreadsheetId 
                      ? 'text-green-600 bg-green-50 hover:bg-green-100' 
                      : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  title={empresa.spreadsheetId ? "Configurar Planilha (Conectado)" : "Conectar Google Planilhas"}
                >
                  <FileSpreadsheet className="w-5 h-5" />
                </button>
                {empresaAtual?.id === empresa.id && (
                  <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {empresas.length === 0 && (
          <div className="col-span-full bg-white rounded-xl shadow-sm p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 mb-4">Nenhuma empresa cadastrada</p>
            <button
              onClick={() => {
                setEmpresaEditando(null);
                setNome('');
                setCnpj('');
                setShowModal(true);
              }}
              className="text-primary-600 hover:underline"
            >
              Criar primeira empresa
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slideIn">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              {empresaEditando?.appearance?.logo && (
                <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                  <img src={empresaEditando.appearance.logo} alt="Logo" className="w-full h-full object-contain p-0.5" />
                </div>
              )}
              <h3 className="text-lg font-semibold text-slate-800">{empresaEditando ? 'Editando' : 'Nova Empresa'}{nome ? `: ${nome}` : ''}</h3>
            </div>
            
            <form onSubmit={handleSalvar} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Nome da empresa"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="00.000.000/0000-00"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(''); setEmpresaEditando(null); setNome(''); setCnpj(''); }}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-primary-300"
                >
                  {loading ? 'Salvando...' : (empresaEditando ? 'Salvar' : 'Criar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Configuração Google Sheets */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-slideIn max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSaveConfig}>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-20">
                <div className="flex items-center gap-3">
                  {configEmpresa?.appearance?.logo && (
                    <div className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <img src={configEmpresa.appearance.logo} alt="Logo" className="w-full h-full object-contain p-0.5" />
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-slate-800">Conexão Planilhas: {configEmpresa?.nome}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowConfigModal(false); setError(''); }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 text-sm"
                  >
                    {loading ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ID da Planilha</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={spreadsheetId}
                    onChange={(e) => {
                      setSpreadsheetId(e.target.value);
                      setSheetData([]);
                      setFullSheetData([]);
                    }}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  />
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!spreadsheetId || loadingPreview}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                  >
                    {loadingPreview ? 'Carregando...' : 'Visualizar'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  O ID é a parte longa na URL da sua planilha Google.
                </p>
              </div>

              {sheetNames.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Selecione a Aba (Sheet)</label>
                  <select
                    value={selectedSheet}
                    onChange={handleSheetChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {sheetData.length > 0 && (
                <div className="mt-4 border rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b text-sm font-medium text-slate-700 flex justify-between items-center">
                    <span>Dados da Planilha (Sincronizado)</span>
                    {fullSheetData.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                        {fullSheetData.length} registros carregados
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          {sheetData[0]?.map((header, i) => (
                            <th key={i} className="px-4 py-2 font-medium whitespace-nowrap">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sheetData.slice(1).map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => {
                              const header = (sheetData[0][j] || '').toLowerCase().trim();
                              const isDateColumn = ['início', 'inicio', 'término', 'termino'].includes(header);
                              
                              const displayCell = isDateColumn ? formatSheetDate(cell) : cell;
                              
                              return (
                                <td key={j} className="px-4 py-2 whitespace-nowrap text-slate-700">{displayCell}</td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {configEmpresa?.spreadsheetId && (
                <div className="pt-4 border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="w-full px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Desconectar Planilha
                  </button>
                </div>
              )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Configuração de Aparência */}
      {showAppearanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slideIn">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {appearanceConfig.logo && (
                  <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                    <img src={appearanceConfig.logo} alt="Logo" className="w-full h-full object-contain p-0.5" />
                  </div>
                )}
                <h3 className="text-lg font-semibold text-slate-800">Aparência: {selectedEmpresaAppearance?.nome}</h3>
              </div>
              <button onClick={() => setShowAppearanceModal(false)} className="text-slate-400 hover:text-slate-600">
                <Trash2 className="w-5 h-5 rotate-45" /> {/* Using Trash as close icon placeholder or replace with X */}
              </button>
            </div>
            
            <form onSubmit={handleSaveAppearance} className="p-6 space-y-6">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Logo da Empresa</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                    {appearanceConfig.logo ? (
                      <img src={appearanceConfig.logo} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}
                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Upload className="w-6 h-6 text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                    </label>
                  </div>
                  <div className="text-xs text-slate-500">
                    <p>Clique na imagem para alterar.</p>
                    <p>Recomendado: PNG transparente.</p>
                  </div>
                </div>
              </div>

              {/* Cores */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor do Menu (Sidebar)</label>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1">
                    <input 
                      type="color" 
                      value={appearanceConfig.sidebarColor}
                      onChange={(e) => setAppearanceConfig({...appearanceConfig, sidebarColor: e.target.value})}
                      className="w-8 h-8 rounded cursor-pointer border-none bg-transparent p-0"
                    />
                    <span className="text-xs text-slate-600 uppercase">{appearanceConfig.sidebarColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor da Fonte (Menu)</label>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1">
                    <input 
                      type="color" 
                      value={appearanceConfig.sidebarTextColor}
                      onChange={(e) => setAppearanceConfig({...appearanceConfig, sidebarTextColor: e.target.value})}
                      className="w-8 h-8 rounded cursor-pointer border-none bg-transparent p-0"
                    />
                    <span className="text-xs text-slate-600 uppercase">{appearanceConfig.sidebarTextColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor Primária</label>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1">
                    <input 
                      type="color" 
                      value={appearanceConfig.primaryColor}
                      onChange={(e) => setAppearanceConfig({...appearanceConfig, primaryColor: e.target.value})}
                      className="w-8 h-8 rounded cursor-pointer border-none bg-transparent p-0"
                    />
                    <span className="text-xs text-slate-600 uppercase">{appearanceConfig.primaryColor}</span>
                  </div>
                </div>
              </div>

              {/* Tamanho da Fonte */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tamanho da Fonte</label>
                <select 
                  value={appearanceConfig.fontSize}
                  onChange={(e) => setAppearanceConfig({...appearanceConfig, fontSize: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="small">Pequeno</option>
                  <option value="normal">Normal (Padrão)</option>
                  <option value="large">Grande</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAppearanceModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Configuração'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Função auxiliar para processar e limpar os dados antes de salvar no Realtime Database
const processData = (data) => {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;

    // 1. Número (Serial Excel)
    if (typeof valor === 'number') {
      const valorAjustado = Math.floor(valor + 0.001);
      const date = new Date((valorAjustado - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    
    if (typeof valor === 'string') {
      const v = valor.trim();
      
      // 2. Formato DD/MM/AAAA HH:mm (Estrito BR)
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null;
        const min = dmy[5] ? parseInt(dmy[5], 10) : null;
        
        if (ano < 100) ano += 2000;

        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
             if (hora !== null) {
               const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
               if (!isNaN(date.getTime())) return date.toISOString();
             } else {
               const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
               if (!isNaN(date.getTime())) return date.toISOString();
             }
        }
      }

      // 3. Formato ISO YYYY-MM-DD HH:mm
      const ymd = v.match(/^(\d{4})\/\-\.\/\-\.(?:[\sT]+(\d{1,2}):(\d{2}))?/);
      if (ymd) {
         const ano = parseInt(ymd[1], 10);
         const mes = parseInt(ymd[2], 10);
         const dia = parseInt(ymd[3], 10);
         const hora = ymd[4] ? parseInt(ymd[4], 10) : null;
         const min = ymd[5] ? parseInt(ymd[5], 10) : null;

         if (hora !== null) {
            const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
            if (!isNaN(date.getTime())) return date.toISOString();
         } else {
            const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
            if (!isNaN(date.getTime())) return date.toISOString();
         }
      }
    }
    return null;
  };

  const combinarDataHora = (dataISO, horaVal) => {
    if (!dataISO) return null;
    if (horaVal === undefined || horaVal === null || String(horaVal).trim() === '') return dataISO;
    
    const date = new Date(dataISO);
    let hours = 0;
    let minutes = 0;

    if (typeof horaVal === 'number') {
      const totalSeconds = Math.round(horaVal * 86400);
      hours = Math.floor(totalSeconds / 3600) % 24;
      minutes = Math.floor((totalSeconds % 3600) / 60);
    } else if (typeof horaVal === 'string') {
      const v = horaVal.trim();
      if (v.includes('T') || v.includes('-') || v.includes('/')) {
        const timeDate = new Date(v);
        if (!isNaN(timeDate.getTime())) {
          hours = v.toUpperCase().includes('Z') ? timeDate.getUTCHours() : timeDate.getHours();
          minutes = v.toUpperCase().includes('Z') ? timeDate.getUTCMinutes() : timeDate.getMinutes();
        }
      } else {
        const parts = v.split(':');
        if (parts.length >= 2) {
          hours = parseInt(parts[0], 10) || 0;
          minutes = parseInt(parts[1], 10) || 0;
        }
      }
    }
    
    const localDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0, 0);
    return localDate.toISOString();
  };

  data.forEach((row, index) => {
    const getVal = (keys) => {
      const normalize = (k) => k ? String(k).toLowerCase().replace(/\s+/g, ' ').trim() : '';
      for (const k of keys) {
        let val = row[k];
        if (val === undefined) {
          const target = normalize(k);
          const foundKey = Object.keys(row).find(rk => normalize(rk) === target);
          if (foundKey) val = row[foundKey];
        }
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
      return undefined;
    };

    const nome = getVal(['TAREFA', 'tarefa', 'Nome', 'nome', 'Etapa', 'etapa', 'Etapas', 'etapas', 'Tarefas', 'tarefas', 'Atividade', 'atividade', 'Descrição', 'descricao', 'Item', 'item']);
    if (!nome) return;

    let rawOrdem = getVal(['D+', 'd+', 'Ordem', 'ordem', 'Dia', 'dia']);
    let ordem = parseInt(rawOrdem);
    if (isNaN(ordem)) ordem = index + 1;

    let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    
    let dataReal = formatarData(getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End']));
    const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
    dataReal = combinarDataHora(dataReal, horaTermino);

    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    
    let status = 'pendente';
    const now = new Date();
    const statusStr = rawStatus ? String(rawStatus).toLowerCase() : '';
    const hasDataReal = dataReal !== null && dataReal !== undefined;
    const isExplicitlyConcluido = statusStr.includes('conclu');

    if (hasDataReal || isExplicitlyConcluido) {
        status = 'concluido';
        if (dataReal && dataPrevista && new Date(dataReal) > new Date(dataPrevista)) {
            status = 'concluido_atraso';
        }
    } else {
        if (dataPrevista && new Date(dataPrevista) < now) {
            status = 'atrasado';
        } else if (statusStr.includes('andamento')) {
            status = 'em_andamento';
        } else {
            status = 'pendente';
        }

        if (statusStr.includes('atras')) {
            status = 'atrasado';
        }
    }

    etapasValidadas.push({
      nome: nome,
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: String(getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código']) || ''),
      status: status,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por']) || ''
    });
  });

  return etapasValidadas;
};
