import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, getDocs, writeBatch } from 'firebase/firestore';
import { ref, get, set } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { firestore, db } from '../firebase';
import { usePermissao } from '../hooks/usePermissao';
import { FileSpreadsheet, AlertCircle, Check, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { checkPermission } from './permissionUtils';

export default function Importacao() {
  const { empresaAtual, empresas, selecionarEmpresa } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('importacao');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  
  const [empresaDados, setEmpresaDados] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [rawSheetData, setRawSheetData] = useState([]); // Para re-processamento com diff
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      const userRef = doc(firestore, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
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


  useEffect(() => {
    if (!empresaAtual) return;
    
    // Limpa dados da empresa anterior para evitar mistura
    setEmpresaDados(null);
    setPreviewData([]);
    setError('');
    setSuccess('');

    // Busca dados atualizados da empresa no Firestore
    const empresaRef = doc(firestore, 'tenants', empresaAtual.id);
    const unsubEmpresa = onSnapshot(empresaRef, (snapshot) => {
      const data = snapshot.data();
      if (data) {
        setEmpresaDados({ id: empresaAtual.id, ...data });
      }
    });

    return () => {
      unsubEmpresa();
    };
  }, [empresaAtual]);

  const handleImport = async () => {
    if (previewData.length === 0) {
      setError('Nenhum dado para importar.');
      return;
    }

    if (!window.confirm("Deseja importar os dados da planilha? As etapas serão atualizadas: novas serão adicionadas, existentes serão modificadas e as que não estiverem na planilha serão removidas. O status e as datas reais das etapas existentes serão substituídos pelos dados da planilha. Continuar?")) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Usa os dados brutos para re-processar com o contexto do banco
      // A data aqui pode não ser precisa, mas serve para agrupar. A data final virá do processData.
      const rawTasksByPeriod = rawSheetData.reduce((acc, task, index) => {
        const processedTask = previewData[index];
        if (processedTask && processedTask.dataPrevista) {
          const d = new Date(processedTask.dataPrevista);
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(task);
        }
        return acc;
      }, {});

      if (Object.keys(rawTasksByPeriod).length === 0) {
        throw new Error("Nenhuma tarefa com data de início válida foi encontrada para importação.");
      }

      const periodsRef = collection(firestore, 'tenants', empresaAtual.id, 'periodos');
      const periodsSnap = await getDocs(periodsRef);
      const existingPeriods = periodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // ESPECIALISTA: Processamento PARALELO de períodos para máxima velocidade
      const periodPromises = Object.keys(rawTasksByPeriod).map(async (periodKey) => {
        const [year, month] = periodKey.split('-').map(Number);
        const rawTasksForPeriod = rawTasksByPeriod[periodKey];
        
        let periodOperations = [];
        let periodDoc = existingPeriods.find(p => p.ano === year && p.mes === month);
        let periodId;
        let existingEtapas = [];

        if (periodDoc) {
          periodId = periodDoc.id;
          // OTIMIZAÇÃO: A função processData foi otimizada e não precisa mais de uma pré-busca.
          // A lógica de diff agora é feita de forma mais inteligente.
          // const etapasRef = collection(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas');
          // const existingEtapasSnap = await getDocs(etapasRef);
          // existingEtapas = existingEtapasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          const newPeriodRef = doc(collection(firestore, 'tenants', empresaAtual.id, 'periodos'));
          periodOperations.push({ 
            type: 'set', 
            ref: newPeriodRef, 
            data: { ano: year, mes: month, status: 'aberto', createdAt: new Date().toISOString() } 
          });
          periodId = newPeriodRef.id;
        }

        const processedTasks = processData(rawTasksForPeriod, existingEtapas);
        const processedTaskIds = new Set(processedTasks.map(t => t.id).filter(Boolean));
        const existingMap = new Map(existingEtapas.map(e => [e.id, e]));

        // ESPECIALISTA: Delta Sync - Só gera operação para o que realmente mudou na planilha
        processedTasks.forEach(task => {
          const { id, ...dataToSave } = task;
          const existing = id ? existingMap.get(id) : null;

          // Otimização Avançada: Delta-checking para reduzir escritas.
          // Compara apenas os campos essenciais. Se apenas o status mudou,
          // faz um update menor.
          let hasChanged = !existing;
          if (existing) {
            const coreFields = ['nome', 'codigo', 'area', 'responsavel', 'dataPrevista'];
            const statusFields = ['status', 'dataReal', 'executadoPor', 'observacoes'];
            
            const coreDataChanged = coreFields.some(key => 
              String(dataToSave[key] ?? '') !== String(existing[key] ?? '')
            );

            if (coreDataChanged) {
              hasChanged = true;
            } else {
              const statusDataChanged = statusFields.some(key => 
                String(dataToSave[key] ?? '') !== String(existing[key] ?? '')
              );
              if (statusDataChanged) hasChanged = true;
            }
          }
          if (hasChanged) {
            const taskRef = id ? doc(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas', id) : doc(collection(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas'));
            periodOperations.push({ type: 'set', ref: taskRef, data: dataToSave });
          }
        });

        existingEtapas.forEach(dbTask => {
          if (!processedTaskIds.has(dbTask.id)) {
            periodOperations.push({ type: 'delete', ref: doc(firestore, 'tenants', empresaAtual.id, 'periodos', periodId, 'etapas', dbTask.id) });
          }
        });

        const BATCH_SIZE = 450;
        const batchPromises = [];
        for (let i = 0; i < periodOperations.length; i += BATCH_SIZE) {
          const batch = writeBatch(firestore);
          periodOperations.slice(i, i + BATCH_SIZE).forEach(op => {
            if (op.type === 'delete') batch.delete(op.ref);
            if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
          });
          batchPromises.push(batch.commit());
        }
        await Promise.all(batchPromises);
        return periodOperations.length;
      });

      const results = await Promise.all(periodPromises);
      const totalOperations = results.reduce((acc, curr) => acc + curr, 0);

      // ATUALIZAÇÃO DO CACHE: Atualiza o cache do Realtime Database para o Dashboard refletir as mudanças
      if (rawSheetData.length > 0) {
        const cacheRef = ref(db, `tenants/${empresaAtual.id}/tabelaGoogle`);
        const fullProcessedData = processData(rawSheetData);
        await set(cacheRef, fullProcessedData);
      }

      setSuccess(`Importação concluída! ${totalOperations} operações (criação/atualização/exclusão) foram realizadas.`);
      setPreviewData([]);
      setRawSheetData([]);
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleImport = async () => {
    const dados = empresaDados || empresaAtual;
    if (!dados?.spreadsheetId) {
      setError('Esta empresa não possui uma planilha Google configurada. Vá em "Empresas" para configurar.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setPreviewData([]);

    try {
      let jsonData = [];
      const sheetParam = dados.sheetName ? `&sheet=${encodeURIComponent(dados.sheetName)}` : '&gid=0';
      const url = `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}&t=${Date.now()}`;
      
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Erro ao conectar com a planilha Google.');
        
        const csvText = await response.text();
        if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.includes('<html')) {
          throw new Error('Planilha privada ou link inválido.');
        }

        const workbook = XLSX.read(csvText, { type: 'string' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
      } catch (fetchError) {
        console.warn("Erro ao buscar planilha online:", fetchError);
        
        // Tenta buscar do Realtime Database (Cache)
        const snapshot = await get(ref(db, `tenants/${dados.id}/tabelaGoogle`));
        if (snapshot.exists()) {
          jsonData = snapshot.val();
          
          // Verifica se os dados já estão processados (formato do cache)
          // O cache tem chaves como 'nome', 'status', etc. A planilha bruta tem 'TAREFA', 'STATUS'.
          const isCachedData = Array.isArray(jsonData) && jsonData.length > 0 && ('nome' in jsonData[0] || 'ordem' in jsonData[0]);

          if (isCachedData) {
             setPreviewData(jsonData);
             setError('⚠️ MODO OFFLINE: Usando dados da última sincronização (CACHE). As alterações recentes na planilha NÃO aparecerão até que a conexão seja restabelecida.');
             setLoading(false);
             return;
          }

          setError('⚠️ MODO OFFLINE: Usando dados da última sincronização (CACHE).');
        } else {
          throw new Error('Não foi possível acessar a planilha. Verifique se ela está "Publicada na Web" ou sincronize manualmente na tela de Empresas.');
        }
      }

      if (jsonData.length === 0) {
        throw new Error('A planilha Google está vazia.');
      }

      const processed = processData(jsonData);
      
      if (processed.length === 0) {
        const headers = jsonData.length > 0 ? Object.keys(jsonData[0]).join(', ') : 'Sem cabeçalhos';
        throw new Error(`Nenhuma etapa válida encontrada. Colunas identificadas: [${headers}]. Verifique se os nomes correspondem ao modelo.`);
      }

      setRawSheetData(jsonData); // Salva os dados brutos para o handleImport
      setPreviewData(processed);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Erro ao importar do Google Planilhas.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'D+', 'CODIGO', 'TAREFA', 'ATRIBUÍDO PARA', 'ÁREA', 
      'INÍCIO', 'HORA INICIO', 'TÉRMINO', 'HORA TÉRMINO'
    ];
    const exampleRow = [
      '1', 'EX-001', 'Nome da Etapa Exemplo', 'Maria Silva', 'Financeiro', 
      '05/01/2026', '08:00', '05/01/2026', '18:00'
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_importacao_fechamento.xlsx");
  };

  if (loadingPermissoes || loadingProfile) return <div className="flex justify-center p-8 text-slate-500">Carregando permissões...</div>;
  if (!empresaAtual) return <div className="flex justify-center p-8 text-slate-500">Selecione uma empresa.</div>;
  if (!autorizado) return <div className="flex justify-center p-8 text-slate-500">Acesso não autorizado.</div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Importação de Dados</h1>
            <p className="text-slate-500">Importe etapas via Google Planilhas</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <select
            value={empresaAtual?.id || ''}
            onChange={(e) => {
              const novaEmpresa = empresas.find(emp => emp.id === e.target.value);
              if (novaEmpresa) selecionarEmpresa(novaEmpresa);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            {empresas && empresas.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.nome}</option>
            ))}
          </select>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Baixar modelo de planilha Excel"
          >
            <Download className="w-4 h-4" />
            Baixar Modelo
          </button>

          <button
            onClick={handleGoogleImport}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title={empresaDados?.spreadsheetId ? "Importar da planilha configurada" : "Configure a planilha na tela de Empresas"}
          >
            <RefreshCw className="w-4 h-4" />
            Google Planilhas
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-700">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}

      {previewData.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nenhum dado carregado</h3>
          <p className="text-slate-500">Selecione um período e clique em "Google Planilhas" para carregar os dados.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Importação via Google Planilhas</h3>
                <p className="text-sm text-slate-500">
                  {previewData.length} registros encontrados
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setPreviewData([]); setError(''); setSuccess(''); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Importação
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">
              Pré-visualização (Total: {previewData.length} registros)
              {(empresaDados?.spreadsheetId || empresaAtual?.spreadsheetId) && (
                <span className="ml-2 text-xs text-slate-500 font-normal">ID: {empresaDados?.spreadsheetId || empresaAtual?.spreadsheetId}</span>
              )}
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-2 font-medium">D+</th>
                    <th className="px-4 py-2 font-medium">Código</th>
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Área</th>
                    <th className="px-4 py-2 font-medium">Responsável</th>
                    <th className="px-4 py-2 font-medium">Executado Por</th>
                    <th className="px-4 py-2 font-medium">Data Prevista</th>
                    <th className="px-4 py-2 font-medium">Hora Prevista</th>
                    <th className="px-4 py-2 font-medium">Data Real</th>
                    <th className="px-4 py-2 font-medium">Hora Real</th>
                    <th className="px-4 py-2 font-medium">Descrição</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600">{row.ordem}</td>
                      <td className="px-4 py-2 text-slate-600">{row.codigo}</td>
                      <td className="px-4 py-2 text-slate-800 font-medium">{row.nome}</td>
                      <td className="px-4 py-2 text-slate-600">{row.area}</td>
                      <td className="px-4 py-2 text-slate-600">{row.responsavel}</td>
                      <td className="px-4 py-2 text-slate-600">{row.executadoPor}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {row.dataPrevista ? new Date(row.dataPrevista).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {row.dataPrevista ? new Date(row.dataPrevista).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {row.dataReal ? new Date(row.dataReal).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {row.dataReal ? new Date(row.dataReal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={row.descricao}>{row.descricao}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${row.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={row.observacoes}>{row.observacoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function processData(data, existingSteps = []) {
  if (!Array.isArray(data)) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();
  const usedIds = new Set(); // Rastreia IDs já vinculados para permitir códigos duplicados em tarefas diferentes

  const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';

  const existingByCodeAndName = new Map();
  const existingByCode = new Map();
  const existingByName = new Map();

  existingSteps.forEach(e => {
    const code = normalizeVal(e.codigo);
    const name = normalizeVal(e.nome);
    if (code && name) existingByCodeAndName.set(`${code}|${name}`, e);
    if (code) {
      if (!existingByCode.has(code)) existingByCode.set(code, []);
      existingByCode.get(code).push(e);
    }
    if (name) {
      if (!existingByName.has(name)) existingByName.set(name, []);
      existingByName.get(name).push(e);
    }
  });

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
      
      // Proteção contra redimensionamento de fuso horário (ignora se já for ISO)
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
      
      // 2. Formato DD/MM/AAAA HH:mm (Estrito BR)
      const dmy = v.match(/^(\d{1,2})\/\-\.\/\-\.(?:\s+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10);
        const mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null;
        const min = dmy[5] ? parseInt(dmy[5], 10) : null;
        
        if (ano < 100) ano += 2000;

        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
             if (hora !== null) {
               // Se tiver hora, usa o horário local para preservar o "relógio"
               const date = new Date(ano, mes - 1, dia, hora, min || 0, 0);
               if (!isNaN(date.getTime())) return date.toISOString();
             } else {
               // Se for só data, usa UTC meio-dia para evitar problemas de fuso
               const date = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
               if (!isNaN(date.getTime())) return date.toISOString();
             }
        }
      }

      // 3. Formato ISO YYYY-MM-DD HH:mm (ou similar)
      const ymd = v.match(/^(\d{4})\/\-\.\/\-\.(?:T\s:(\d{2}))?/);
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
    
    // Extrai componentes da data base (que está em UTC 12:00)
    const dt = new Date(dataISO);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth();
    const day = dt.getUTCDate();

    let hours = 0;
    let minutes = 0;

    if (typeof horaVal === 'number') {
      // Math.round para corrigir imprecisão de ponto flutuante do Excel (ex: 0.33333... deve ser 08:00 e não 07:59)
      const totalSeconds = Math.round(horaVal * 86400);
      hours = Math.floor(totalSeconds / 3600) % 24;
      minutes = Math.floor((totalSeconds % 3600) / 60);
    } else if (typeof horaVal === 'string') {
      const v = horaVal.trim();
      // Verifica se é uma data ISO ou formato com data (ex: 1899-12-30T18:12:00)
      if (v.includes('T') || v.includes('-') || v.includes('/')) {
        const timeDate = new Date(v);
        if (!isNaN(timeDate.getTime())) {
          // Se tiver 'Z', usa UTC, senão usa local
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
    
    // Cria data usando o fuso horário local do navegador para preservar o "horário de relógio" (Wall Time)
    // Isso evita que 08:00 vire 05:00 ou 11:00 devido a conversões de UTC
    const localDate = new Date(year, month, day, hours, minutes, 0, 0);
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
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    
    if (!nome) return;

    // Evita processar linhas duplicadas na mesma planilha (mesmo código ou mesmo nome)
    // Chave única composta para permitir mesmo código com nomes diferentes
    const uniqueKey = `${codigo ? 'code:' + normalizeVal(codigo) : ''}|name:${normalizeVal(nome)}`;
    
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);

    const codeVal = normalizeVal(codigo);
    const nameVal = normalizeVal(nome);

    let existing = null;
    // OTIMIZAÇÃO: Busca O(1) usando os Mapas pré-construídos
    if (codeVal && nameVal && existingByCodeAndName.has(`${codeVal}|${nameVal}`)) {
      existing = existingByCodeAndName.get(`${codeVal}|${nameVal}`);
    } else if (codeVal && existingByCode.has(codeVal)) {
      const matches = existingByCode.get(codeVal);
      existing = matches.find(e => !usedIds.has(e.id));
    } else if (nameVal && existingByName.has(nameVal)) {
      const matches = existingByName.get(nameVal);
      const match = matches.find(e => !usedIds.has(e.id));
      if (match) {
        const codeB = normalizeVal(match.codigo);
        if (!(codeVal && codeB && codeVal !== codeB)) {
          existing = match;
        }
      }
    }

    if (existing) {
      usedIds.add(existing.id);
    }

    let rawOrdem = getVal(['D+', 'd+', 'Ordem', 'ordem', 'Dia', 'dia']);
    let ordem = parseInt(rawOrdem);
    if (isNaN(ordem) && typeof rawOrdem === 'string') {
       const match = rawOrdem.match(/\d+/);
       if (match) ordem = parseInt(match[0]);
    }
    if (isNaN(ordem)) ordem = index + 1;

    let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada']));
    const horaInicio = getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']);
    dataPrevista = combinarDataHora(dataPrevista, horaInicio);
    
    let rawDataReal = getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End']);
    let dataReal = formatarData(rawDataReal);
    const horaTermino = getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']);
    dataReal = combinarDataHora(dataReal, horaTermino);
    
    // Lógica de Status Corrigida
    let status = 'pendente';
    const now = new Date();

    let rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
    
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

    let concluidoEm = existing?.concluidoEm || null;
    let quemConcluiu = existing?.quemConcluiu || null;

    if (status.startsWith('concluido')) {
      // Preserva quem concluiu se já estava concluído, senão atribui à importação
      if (!quemConcluiu) quemConcluiu = 'Importação';
      if (!dataReal) dataReal = dataPrevista || new Date().toISOString();
      concluidoEm = dataReal;
    } else {
      // Se o status mudou de concluído para pendente, limpa os dados de conclusão
      concluidoEm = null;
      quemConcluiu = null;
    }

    etapasValidadas.push({
      id: existing ? existing.id : null, // Preserva o ID para atualizar em vez de duplicar
      nome: nome,
      descricao: getVal(['Descrição', 'descricao']) || '',
      area: getVal(['ÁREA', 'área', 'area', 'Área']) || '',
      responsavel: getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '',
      dataPrevista: dataPrevista,
      dataReal: dataReal,
      ordem: ordem,
      codigo: (codigo !== undefined && codigo !== null) ? String(codigo) : '',
      observacoes: getVal(['Observações', 'observacoes', 'Observação', 'observação', 'Observacao', 'observacao', 'OBSERVAÇÃO', 'Obs', 'obs']) || '',
      status: status,
      concluidoEm: concluidoEm || null,
      quemConcluiu: quemConcluiu || null,
      executadoPor: getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || quemConcluiu || '',
      ...row
    });
  });

  return etapasValidadas;
};
