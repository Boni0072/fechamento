import { useState, useEffect, useMemo } from 'react';
import { getFirestore, doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao'; // eslint-disable-line no-unused-vars
import { getResponsaveis } from '../services/database';
import { Bell, Clock, AlertTriangle, Settings, Mail, Send, X, Mailbox, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { checkPermission } from './permissionUtils';

export default function Notificacoes() {
  const { empresaAtual, empresas } = useAuth();
  const { loading: loadingPermissoes, user: authUser, autorizado } = usePermissao('notificacoes');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [allEtapas, setAllEtapas] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [tab, setTab] = useState('alertas');
  const [responsaveisMap, setResponsaveisMap] = useState({});
  const [usersMap, setUsersMap] = useState({});
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showProximas, setShowProximas] = useState(false);
  const [showAtrasadas, setShowAtrasadas] = useState(false);
  const [config, setConfig] = useState({
    emailAlerts: true,
    delayAlerts: true,
    daysNotice: 3
  });
  const [stepsByCompany, setStepsByCompany] = useState({});
  const [periodosPorEmpresa, setPeriodosPorEmpresa] = useState({});

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : authUser);
        if (data?.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }
        setLoadingProfile(false);
      }, (error) => {
        console.error("Erro ao carregar perfil do usuário:", error);
        setLoadingProfile(false);
      });
      return () => unsubscribe();
    } else {
      setLoadingProfile(false);
    }
  }, [authUser, empresaAtual]);


  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
      setStepsByCompany({});
      setAllEtapas([]);
      return;
    }

    const db = getDatabase();
    const unsubscribes = [];

    empresasParaBuscar.forEach(emp => {
        const tableRef = ref(db, `tenants/${emp.id}/tabelaGoogle`);
        const unsub = onValue(tableRef, (snapshot) => {
            const data = snapshot.val();
            const processed = data ? processData(data) : [];
            setStepsByCompany(prev => ({
              ...prev,
              [emp.id]: processed.map(d => ({ ...d, empresaId: emp.id, empresaNome: emp.nome }))
            }));
        });
        unsubscribes.push(unsub);
    });
    
    return () => unsubscribes.forEach(u => u());
  }, [empresasParaBuscar]);

  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
      setPeriodosPorEmpresa({});
      return;
    }

    const firestore = getFirestore();
    const unsubscribes = empresasParaBuscar.map(empresa => onSnapshot(
      collection(firestore, 'tenants', empresa.id, 'periodos'),
      snapshot => {
        setPeriodosPorEmpresa(prev => ({
          ...prev,
          [empresa.id]: snapshot.docs.map(periodo => ({ id: periodo.id, ...periodo.data() }))
        }));
      }
    ));

    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [empresasParaBuscar]);

  useEffect(() => {
    const allStepsRaw = Object.values(stepsByCompany).flat();
    // Correção: Usa uma chave composta para garantir a unicidade.
    // Quando o id não existe (dados do RTDB sem etapas manuais), usa codigo+nome como fallback
    const uniqueStepsMap = new Map();
    allStepsRaw.forEach(step => {
      const key = step.id
        ? `${step.empresaId}-${step.id}`
        : `${step.empresaId}-${step.codigo || ''}-${step.nome}`;
      uniqueStepsMap.set(key, step);
    });
    const allSteps = Array.from(uniqueStepsMap.values());
    setAllEtapas(allSteps);
  }, [stepsByCompany]);

  useEffect(() => {
    const periodsMap = new Map();
    Object.values(periodosPorEmpresa).flat().forEach(periodo => {
      const mes = parseInt(periodo.mes, 10);
      const ano = parseInt(periodo.ano, 10);
      if (mes >= 1 && mes <= 12 && ano) {
        periodsMap.set(`${mes}-${ano}`, { id: `${mes}-${ano}`, mes, ano });
      }
    });
    allEtapas.forEach(step => {
      if (step.dataPrevista) {
        const d = new Date(step.dataPrevista);
        if (!isNaN(d.getTime())) {
          const month = d.getMonth() + 1;
          const year = d.getFullYear();
          const key = `${month}-${year}`;
          if (!periodsMap.has(key)) {
            periodsMap.set(key, { id: key, mes: month, ano: year });
          }
        }
      }
    });
    const sortedData = Array.from(periodsMap.values()).sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    const periodosDisponiveis = [{ id: 'todos', mes: 'Todos', ano: '' }, ...sortedData];
    setPeriodos(periodosDisponiveis);
    setPeriodoSelecionado(prev => periodosDisponiveis.find(p => p.id === prev?.id) || periodosDisponiveis[0]);
  }, [allEtapas, periodosPorEmpresa]);

  useEffect(() => {
    if (periodoSelecionado && periodoSelecionado.id !== 'todos') {
      const filtered = allEtapas.filter(e => {
        if (!e.dataPrevista) return false;
        const d = new Date(e.dataPrevista);
        return (d.getMonth() + 1) == periodoSelecionado.mes && d.getFullYear() == periodoSelecionado.ano;
      });
      setEtapas(filtered);
    } else {
      setEtapas(allEtapas);
    }
  }, [allEtapas, periodoSelecionado]);

  // Busca responsáveis para obter os e-mails
  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) return;
    const unsubs = [];
    empresasParaBuscar.forEach(emp => {
        const unsub = getResponsaveis(emp.id, (data) => {
            setResponsaveisMap(prev => ({ ...prev, [emp.id]: data }));
        });
        unsubs.push(unsub);
    });
    return () => unsubs.forEach(u => u());
  }, [empresasParaBuscar]);

  // Busca usuários do sistema para obter e-mails (Prioridade)
  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) return;
    const db = getFirestore();
    const unsubs = [];
    empresasParaBuscar.forEach(emp => {
        const usersRef = collection(db, 'tenants', emp.id, 'usuarios');
        const unsub = onSnapshot(usersRef, (snapshot) => {
            const users = snapshot.docs.map(d => d.data());
            setUsersMap(prev => ({ ...prev, [emp.id]: users }));
        });
        unsubs.push(unsub);
    });
    return () => unsubs.forEach(u => u());
  }, [empresasParaBuscar]);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const etapasProximasPrazo = etapas.filter(e => {
    if (e.dataReal) return false;
    if (!e.dataPrevista) return false;
    const prevista = new Date(e.dataPrevista);
    prevista.setHours(0, 0, 0, 0);
    const dias = differenceInDays(prevista, hoje);
    return dias >= 0 && dias <= Number(config.daysNotice || 3);
  });

  // Filtra atrasadas garantindo que não tenham dataReal (evita falsos positivos de status desatualizado)
  const etapasAtrasadas = etapas.filter(e => e.status === 'atrasado' && !e.dataReal);

  // Agrupa notificações por usuário
  const notificationsByUser = useMemo(() => {
    const groups = {};
    
    const addToGroup = (task, type) => {
        const respName = task.responsavel;
        if (!respName) return;
        
        const empId = task.empresaId;
        // Chave única por empresa e responsável
        const key = `${empId}_${respName}`;
        
        if (!groups[key]) {
            const empResps = responsaveisMap[empId] || [];
            const empUsers = usersMap[empId] || [];
            
            // Normalização para comparação mais flexível (ignora case e espaços)
            const normalize = s => s ? String(s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
            const targetName = normalize(respName);
            
            let email = '';

            const findInList = (list) => {
                if (!list) return null;
                // 1. Busca Exata
                let found = list.find(u => normalize(u.nome || u.name) === targetName);
                
                // 2. Busca por Primeiro Nome (se o nome na tarefa for simples ex: "Edson")
                if (!found && targetName.indexOf(' ') === -1) {
                    found = list.find(u => {
                        const uName = normalize(u.nome || u.name);
                        return uName.split(' ')[0] === targetName;
                    });
                }
                // 3. Busca se o nome do usuário começa com o nome da tarefa (ex: "Edson" -> "Edson Silva")
                if (!found && targetName.length > 2) {
                    found = list.find(u => normalize(u.nome || u.name).startsWith(targetName));
                }
                return found;
            };

            // 1. Tenta encontrar nos usuários do sistema (Prioridade)
            const userObj = findInList(empUsers);
            if (userObj?.email) email = userObj.email;
            
            // 2. Se não achou, tenta nos responsáveis cadastrados (Fallback)
            if (!email) {
                const respObj = findInList(empResps);
                if (respObj?.email) email = respObj.email;
            }
            
            groups[key] = {
                responsavel: respName,
                email: email,
                empresaNome: task.empresaNome,
                tasks: []
            };
        }
        groups[key].tasks.push({ ...task, type });
    };

    etapasAtrasadas.forEach(t => addToGroup(t, 'atrasada'));
    etapasProximasPrazo.forEach(t => addToGroup(t, 'proxima'));

    return Object.values(groups).sort((a, b) => a.responsavel.localeCompare(b.responsavel));
  }, [etapasAtrasadas, etapasProximasPrazo, responsaveisMap, usersMap]);

  const handleSendAllIndividually = () => {
    const usersWithEmail = notificationsByUser.filter(u => u.email);

    if (usersWithEmail.length === 0) {
      alert("Nenhum responsável com e-mail válido encontrado para o envio.");
      return;
    }

    if (!window.confirm(`Atenção: Isso tentará abrir ${usersWithEmail.length} janelas de e-mail separadas.\n\nSeu navegador pode bloquear pop-ups. Certifique-se de permitir pop-ups para este site.\n\nDeseja continuar?`)) {
      return;
    }

    usersWithEmail.forEach((userGroup, index) => {
      // Pequeno delay entre cada abertura para evitar travamento ou bloqueio agressivo
      setTimeout(() => {
        handleSendToUser(userGroup, true);
      }, index * 800);
    });
    setShowEmailModal(false);
  };

  const handleSendGlobalSummaryEmail = () => {
    const usersWithEmail = notificationsByUser.filter(u => u.email);
    if (usersWithEmail.length === 0) {
      alert("Nenhum responsável com e-mail válido encontrado para o envio.");
      return;
    }
    const recipients = usersWithEmail.map(u => u.email).join(',');

    const subject = encodeURIComponent(`Resumo Geral de Pendências - Fechamento Contábil`);

    let body = `Olá a todos,\n\nSegue um resumo geral de todas as atividades pendentes no fechamento contábil.\n\n`;

    // Constrói o corpo do e-mail com listas diretas, sem agrupar por responsável.
    if (etapasAtrasadas.length > 0) {
      body += `🔴 ETAPAS ATRASADAS (${etapasAtrasadas.length}):\n`;
      etapasAtrasadas.sort((a, b) => new Date(a.dataPrevista) - new Date(b.dataPrevista)).forEach(e => {
        const dataVencimento = e.dataPrevista ? format(new Date(e.dataPrevista), 'dd/MM/yyyy') : 'N/A';
        body += `  - ${e.codigo || ''} ${e.nome} (Responsável: ${e.responsavel || 'N/D'}, Venceu em: ${dataVencimento})\n`;
      });
      body += '\n';
    }

    if (etapasProximasPrazo.length > 0) {
      body += `⚠️ PRÓXIMAS DO PRAZO (${etapasProximasPrazo.length}):\n`;
      etapasProximasPrazo.sort((a, b) => new Date(a.dataPrevista) - new Date(b.dataPrevista)).forEach(e => {
        const dataVencimento = e.dataPrevista ? format(new Date(e.dataPrevista), 'dd/MM/yyyy') : 'N/A';
        body += `  - ${e.codigo || ''} ${e.nome} (Responsável: ${e.responsavel || 'N/D'}, Vence em: ${dataVencimento})\n`;
      });
      body += '\n';
    }

    window.location.href = `mailto:?bcc=${recipients}&subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  const handleSendMassEmail = () => {
    const usersWithEmail = notificationsByUser.filter(u => u.email);

    if (usersWithEmail.length === 0) {
      alert("Nenhum responsável com e-mail válido encontrado para o envio.");
      return;
    }

    const recipients = usersWithEmail.map(u => u.email).join(',');

    const subject = encodeURIComponent(`Alerta Geral de Pendências - Fechamento Contábil`);
    const body = encodeURIComponent(
      `Olá a todos,\n\nEste é um lembrete geral de que existem pendências no fechamento contábil.` +
      `\n\nPor favor, verifiquem suas tarefas no sistema e atualizem o status assim que possível.` +
      `\n\nAtenciosamente,\nEquipe de Fechamento`
    );

    // Usando BCC para proteger a privacidade dos destinatários
    const url = `mailto:?bcc=${recipients}&subject=${subject}&body=${body}`;
    window.location.href = url;
  };

  // Verifica e sugere envio automático ao carregar
  useEffect(() => {
    if (config.emailAlerts && notificationsByUser.length > 0 && empresaAtual?.id) {
      const lastSend = localStorage.getItem(`lastAutoSend_${empresaAtual.id}`);
      const today = new Date().toLocaleDateString();
      
      if (lastSend !== today) {
        // Pequeno delay para garantir que a interface carregou
        const timer = setTimeout(() => {
          // Como navegadores bloqueiam window.open sem interação do usuário,
          // usamos um confirm para que o clique no "OK" conte como interação.
          if (window.confirm(`ENVIO AUTOMÁTICO:\n\nExistem ${notificationsByUser.length} usuários com pendências.\nDeseja enviar o alerta geral para todos agora?`)) {
            handleSendAllIndividually();
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [config.emailAlerts, notificationsByUser.length, empresaAtual?.id]);

  if (loadingPermissoes || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresas || empresas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Nenhuma empresa disponível</p>
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

  const handleUpdateConfig = async (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    if (empresaAtual?.id && authUser?.id) {
      try {
        const db = getFirestore();
        const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
        await updateDoc(userRef, { config: newConfig });
      } catch (error) {
        console.error("Erro ao salvar configurações:", error);
      }
    }
  };

  const handleOpenEmailModal = () => {
    if (!config.emailAlerts) {
      alert("Os alertas por e-mail estão desativados nas configurações. Ative-os na aba 'Configurações' antes de enviar.");
      return;
    }
    if (etapasProximasPrazo.length === 0 && etapasAtrasadas.length === 0) {
      alert("Não há etapas pendentes de notificação no momento.");
      return;
    }
    setShowEmailModal(true);
  };

  const handleSendToUser = (userGroup, openInNewWindow = false) => {
    const recipient = userGroup.email || '';
    
    if (!recipient) {
       if (!window.confirm(`O responsável ${userGroup.responsavel} não possui e-mail cadastrado.\nDeseja abrir o rascunho sem destinatário?`)) {
         return;
       }
    }

    const atrasadas = userGroup.tasks.filter(t => t.type === 'atrasada');
    const proximas = userGroup.tasks.filter(t => t.type === 'proxima');
    const total = atrasadas.length + proximas.length;

    let corpoEmail = `Olá ${userGroup.responsavel},\n\nSeguem suas pendências de fechamento na empresa ${userGroup.empresaNome}:\n\n`;

    if (atrasadas.length > 0) {
      corpoEmail += `🔴 ETAPAS ATRASADAS (${atrasadas.length}):\n`;
      atrasadas.forEach(e => {
        const data = e.dataPrevista ? format(new Date(e.dataPrevista), 'dd/MM/yyyy') : 'Sem data';
        const codigoStr = e.codigo ? `Codigo da Atividade - ${e.codigo}, ` : '';
        corpoEmail += `${codigoStr}Atividade - ${e.nome} (Venceu em: ${data})\n`;
      });
      corpoEmail += '\n';
    }

    if (proximas.length > 0) {
      corpoEmail += `⚠️ PRÓXIMAS DO PRAZO (${proximas.length}):\n`;
      proximas.forEach(e => {
        const data = e.dataPrevista ? format(new Date(e.dataPrevista), 'dd/MM/yyyy') : 'Sem data';
        const codigoStr = e.codigo ? `Codigo da Atividade - ${e.codigo}, ` : '';
        corpoEmail += `${codigoStr}Atividade - ${e.nome} (Vence em: ${data})\n`;
      });
      corpoEmail += '\n';
    }

    corpoEmail += "\nPor favor, quando finalizar a atividade, enviar um e-mail para Fechamento.contabil@redeoba.com.br com o codigo da atividade no assunto do e-mail e com uma evidência da atividade finalizada se possível.\n\nAtenciosamente,\nEquipe de Fechamento - Contabilidade";

    const subject = encodeURIComponent(`Alerta de Fechamento - ${total} pendências`);
    const body = encodeURIComponent(corpoEmail);

    // Abre o cliente de e-mail padrão do usuário com o rascunho pronto para envio.
    const url = `mailto:${recipient}?subject=${subject}&body=${body}`;
    if (openInNewWindow) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Notificações</h1>
            <p style={{ color: 'var(--text-muted)' }}>Configure alertas automáticos para etapas do fechamento</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="period-filter-group">
            <span className="period-filter-label">Período</span>
            <select
            value={periodoSelecionado?.id || ''}
            onChange={(e) => {
              const periodo = periodos.find(p => p.id === e.target.value);
              setPeriodoSelecionado(periodo);
            }}
            className="period-filter"
            aria-label="Selecionar período"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>
                {p.id === 'todos' ? 'Todos os Períodos' : new Date(p.ano, p.mes - 1).toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()) + `/${p.ano}`}
              </option>
            ))}
            </select>
          </div>

          <button
            onClick={handleOpenEmailModal}
            className="btn btn-primary"
            title="Gerar e-mail com as notificações pendentes"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Enviar Notificações</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton active={tab === 'alertas'} onClick={() => setTab('alertas')} icon={<Bell className="w-4 h-4" />} label="Alertas Pendentes" />
        <TabButton active={tab === 'config'} onClick={() => setTab('config')} icon={<Settings className="w-4 h-4" />} label="Configurações" />
      </div>

      {tab === 'alertas' && (
        <div className="space-y-6">
          {/* Próximas do prazo */}
          <div className="card p-6">
            <div 
              className="flex items-center justify-between mb-4 cursor-pointer"
              onClick={() => setShowProximas(!showProximas)}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--warning)]" />
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                  Etapas Próximas do Prazo ({etapasProximasPrazo.length})
                </h2>
              </div>
              {showProximas ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-dim)' }} /> : <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-dim)' }} />}
            </div>
            
            {showProximas && (
              <>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Etapas que vencem nos próximos {config.daysNotice} dias</p>
                
                {etapasProximasPrazo.length === 0 ? (
                  <p className="text-center py-6" style={{ color: 'var(--text-muted)' }}>Nenhuma etapa próxima do prazo para o período selecionado.</p>
                ) : (
                  <div className="space-y-2">
                    {etapasProximasPrazo.map((etapa, index) => {
                      const prevista = new Date(etapa.dataPrevista);
                      prevista.setHours(0, 0, 0, 0);
                      const dias = differenceInDays(prevista, hoje);
                      return (
                        <div key={etapa.id || `prox-${index}`} className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--warning-soft)' }}>
                          <div>
                            <p className="font-medium" style={{ color: 'var(--text)' }}>
                              {etapa.codigo ? `${etapa.codigo} - ` : ''}{etapa.nome}
                            </p>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{etapa.responsavel || 'Sem responsável'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
                              {dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias > 1 ? 's' : ''}`}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {format(new Date(etapa.dataPrevista), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Atrasadas */}
          <div className="card p-6">
            <div 
              className="flex items-center justify-between mb-4 cursor-pointer"
              onClick={() => setShowAtrasadas(!showAtrasadas)}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                  Etapas Atrasadas ({etapasAtrasadas.length})
                </h2>
              </div>
              {showAtrasadas ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-dim)' }} /> : <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-dim)' }} />}
            </div>
            
            {showAtrasadas && (
              <>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Etapas com prazo vencido</p>
                
                {etapasAtrasadas.length === 0 ? (
                  <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                    <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma etapa atrasada para o período selecionado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {etapasAtrasadas.map((etapa, index) => {
                      const prevista = etapa.dataPrevista ? new Date(etapa.dataPrevista) : null;
                      if (prevista) prevista.setHours(0, 0, 0, 0);
                      const dias = prevista ? differenceInDays(hoje, prevista) : 0;

                      return (
                        <div key={etapa.id || `atras-${index}`} className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--danger-soft)' }}>
                          <div>
                            <p className="font-medium" style={{ color: 'var(--text)' }}>
                              {etapa.codigo ? `${etapa.codigo} - ` : ''}{etapa.nome}
                            </p>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{etapa.responsavel || 'Sem responsável'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                              {prevista ? `${dias} dia${dias > 1 ? 's' : ''} de atraso` : 'Data não definida'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              Prevista: {prevista ? format(new Date(etapa.dataPrevista), 'dd/MM/yyyy') : '-'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Configurações de Notificação</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--text)' }}>Alertas por Email</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enviar emails quando etapas estiverem próximas do prazo</p>
                </div>
              </div>
                <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.emailAlerts}
                  onChange={(e) => handleUpdateConfig('emailAlerts', e.target.checked)}
                />
                <div className="w-11 h-6 bg-red-400 peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--text)' }}>Alertas de Atraso</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Notificar quando etapas ficarem atrasadas</p>
                </div>
              </div>
                <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.delayAlerts}
                  onChange={(e) => handleUpdateConfig('delayAlerts', e.target.checked)}
                />
                <div className="w-11 h-6 bg-red-400 peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            <div className="p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <p className="font-medium mb-2" style={{ color: 'var(--text)' }}>Dias de Antecedência</p>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Quantos dias antes do prazo enviar alertas</p>
              <select 
                className="form-input" 
                value={config.daysNotice}
                onChange={(e) => handleUpdateConfig('daysNotice', parseInt(e.target.value))}
              >
                <option value="1">1 dia</option>
                <option value="2">2 dias</option>
                <option value="3">3 dias</option>
                <option value="5">5 dias</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Envio de E-mails */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn backdrop-blur-sm">
          <div className="modal-content w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="modal-header rounded-t-2xl" style={{ background: 'var(--surface-2)' }}>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Central de Notificações</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Envie alertas individuais ou em massa</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSendAllIndividually}
                  className="btn btn-info text-sm font-medium"
                  title="Abre um e-mail individual para cada responsável"
                >
                  <Mailbox className="w-4 h-4" />
                  Enviar Individualmente
                </button>
                <button onClick={() => setShowEmailModal(false)} className="p-2 rounded-full transition-colors">
                  <X className="w-5 h-5" style={{ color: 'var(--text-dim)' }}/>
                </button>
                <button
                  onClick={handleSendGlobalSummaryEmail}
                  className="btn btn-primary text-sm font-medium"
                  title="Abre um único e-mail com todas as atividades de todos os responsáveis, enviado em cópia oculta para todos"
                >
                  <Send className="w-4 h-4" />
                  Enviar Alerta Geral
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto p-4 custom-scrollbar">
              {notificationsByUser.length === 0 ? (
                <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Nenhum responsável com pendências encontrado.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {notificationsByUser.map((group, idx) => (
                    <div key={idx} className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold" style={{ color: 'var(--text)' }}>{group.responsavel}</h4>
                          <span className="badge">{group.empresaNome}</span>
                        </div>
                        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{group.email || 'Sem e-mail cadastrado'}</p>
                        <div className="flex gap-2 text-xs">
                          <span className="badge badge-danger">
                            {group.tasks.filter(t => t.type === 'atrasada').length} Atrasadas
                          </span>
                          <span className="badge badge-warning">
                            {group.tasks.filter(t => t.type === 'proxima').length} Próximas
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendToUser(group)}
                        className={`btn font-medium ${
                          group.email 
                            ? 'btn-info' 
                            : 'btn-secondary'
                        }`}
                        title={group.email ? `Enviar para ${group.email}` : 'Abrir rascunho (sem e-mail cadastrado)'}
                      >
                        <Mail className="w-4 h-4" />
                        Enviar E-mail
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="modal-footer rounded-b-2xl text-right" style={{ background: 'var(--surface-2)' }}>
              <button 
                onClick={() => setShowEmailModal(false)}
                className="btn btn-secondary font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
        active 
          ? 'border-[var(--primary)] text-[var(--primary)]' 
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Função auxiliar para processar dados (Reutiliza lógica da Importação/Dashboard)
function processData(data) {
  const dataArray = Array.isArray(data) ? data : Object.values(data || {});
  if (dataArray.length === 0) return [];
  const etapasValidadas = [];
  const chavesProcessadas = new Set();

  const formatarData = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    if (typeof valor === 'number') {
      const date = new Date((Math.floor(valor + 0.001) - 25569) * 86400 * 1000 + 43200000);
      return date.toISOString();
    }
    if (typeof valor === 'string') {
      const v = valor.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
      const dmy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dia = parseInt(dmy[1], 10), mes = parseInt(dmy[2], 10);
        let ano = parseInt(dmy[3], 10);
        if (ano < 100) ano += 2000;
        const hora = dmy[4] ? parseInt(dmy[4], 10) : null;
        const min = dmy[5] ? parseInt(dmy[5], 10) : null;
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
    const dt = new Date(dataISO);
    const year = dt.getUTCFullYear(), month = dt.getUTCMonth(), day = dt.getUTCDate();
    let hours = 0, minutes = 0;
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
    return new Date(year, month, day, hours, minutes, 0, 0).toISOString();
  };

  dataArray.forEach((row, index) => {
    const getVal = (keys) => {
      const normalize = (k) => k
        ? String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
        : '';
      for (const k of keys) {
        let val = row[k];
        if (val === undefined) {
          const target = normalize(k);
          const foundKey = Object.keys(row).find(rk => normalize(rk) === target);
          if (foundKey) val = row[foundKey];
        }
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
      }
      return undefined;
    };

    const nome = getVal(['TAREFA', 'tarefa', 'Nome', 'nome', 'Etapa', 'etapa', 'Etapas', 'etapas', 'Tarefas', 'tarefas', 'Atividade', 'atividade', 'Descrição', 'descricao', 'Item', 'item']);
    const codigo = getVal(['CODIGO', 'codigo', 'CÓDIGO', 'código', 'Codigo', 'Código', 'Cod', 'COD', 'ID', 'Id', 'Code']);
    if (!nome) return;

    const normalizeVal = (str) => str ? String(str).trim().replace(/\s+/g, ' ').toLowerCase() : '';
    const uniqueKey = `${codigo ? 'code:' + normalizeVal(codigo) : ''}|name:${normalizeVal(nome)}`;
    if (chavesProcessadas.has(uniqueKey)) return;
    chavesProcessadas.add(uniqueKey);

    let dataPrevista = formatarData(getVal(['INÍCIO', 'início', 'inicio', 'Data Prevista', 'dataPrevista', 'Data de Início', 'Data de Inicio', 'Previsão', 'Previsao', 'Data', 'Date', 'Start', 'Planejado', 'Data Planejada']));
    dataPrevista = combinarDataHora(dataPrevista, getVal(['HORA INICIO', 'Hora Inicio', 'hora inicio', 'Hora Início']));
    let dataReal = formatarData(getVal(['TÉRMINO', 'término', 'termino', 'Data Real', 'dataReal', 'Data Conclusão', 'Data Conclusao', 'Conclusão', 'Conclusao', 'Realizado', 'Executado', 'Fim', 'Data de Término', 'Data de Termino', 'Data Fim', 'Data Final', 'End']));
    dataReal = combinarDataHora(dataReal, getVal(['HORA TÉRMINO', 'Hora Término', 'hora término', 'HORA TERMICA', 'Hora Termica']));

    let status = 'pendente';
    const now = new Date();
    const rawStatus = getVal(['STATUS', 'Status', 'status', 'SITUAÇÃO', 'Situação', 'situacao', 'Estado', 'estado']);
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

    const responsavel = getVal(['ATRIBUÍDO PARA', 'atribuído para', 'atribuido para', 'Responsável', 'responsavel', 'Responsavel', 'Owner']) || '';
    const area = getVal(['ÁREA', 'área', 'area', 'Área']) || '';
    const quemConcluiu = getVal(['quemConcluiu', 'Quem Concluiu', 'quem concluiu']);
    const executadoPor = getVal(['EXECUTADO POR', 'Executado Por', 'Executado por', 'executado por', 'ExecutadoPor', 'executadoPor', 'Executor', 'executor', 'Quem executou', 'Realizado por', 'Executado p/', 'Executado P/', 'Executado']) || quemConcluiu || '';

    etapasValidadas.push({
      ...row, nome, codigo, dataPrevista, dataReal, status, responsavel, area, 
      executadoPor: executadoPor || quemConcluiu || '',
      ...row
    });
  });

  return etapasValidadas;
}
