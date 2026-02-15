import { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getPeriodos, getEtapas } from '../services/database';
import { Bell, Clock, AlertTriangle, Settings, Mail } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { checkPermission } from './permissionUtils';

export default function Notificacoes() {
  const { empresaAtual } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('notificacoes');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [tab, setTab] = useState('alertas');

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
      setLoadingProfile(true);
      const db = getFirestore();
      const userRef = doc(db, 'tenants', empresaAtual.id, 'usuarios', authUser.id);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        const data = snapshot.data();
        setUserProfile(data ? { ...authUser, ...data } : authUser);
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

  // Restrição removida temporariamente
  const autorizado = true;

  useEffect(() => {
    if (!empresaAtual) return;
    const unsubscribe = getPeriodos(empresaAtual.id, (data) => {
      // 1. Ordena primeiro para garantir determinismo
      const sortedData = (data || []).sort((a, b) => {
        if (b.ano !== a.ano) return b.ano - a.ano;
        if (b.mes !== a.mes) return b.mes - a.mes;
        return a.id.localeCompare(b.id);
      });
      // 2. Filtra duplicatas
      const periodosUnicos = sortedData.filter((item, index, self) =>
        index === self.findIndex(p => p.mes === item.mes && p.ano === item.ano)
      );
      setPeriodos(periodosUnicos);
      if (periodosUnicos.length > 0 && !periodoSelecionado) {
        setPeriodoSelecionado(periodosUnicos[0]);
      }
    });
    return () => unsubscribe();
  }, [empresaAtual]);

  useEffect(() => {
    if (!empresaAtual || !periodoSelecionado) return;
    const unsubscribe = getEtapas(empresaAtual.id, periodoSelecionado.id, setEtapas);
    return () => unsubscribe();
  }, [empresaAtual, periodoSelecionado]);

  if (loadingPermissoes || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!empresaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para ver notificações</p>
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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const etapasProximasPrazo = etapas.filter(e => {
    if (e.dataReal) return false;
    if (!e.dataPrevista) return false;
    const prevista = new Date(e.dataPrevista);
    const dias = differenceInDays(prevista, hoje);
    return dias >= 0 && dias <= 3;
  });

  const etapasAtrasadas = etapas.filter(e => e.status === 'atrasado');

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Notificações</h1>
            <p className="text-slate-500">Configure alertas automáticos para etapas do fechamento</p>
          </div>
        </div>
        
        <select
          value={periodoSelecionado?.id || ''}
          onChange={(e) => {
            const periodo = periodos.find(p => p.id === e.target.value);
            setPeriodoSelecionado(periodo);
          }}
          className="px-4 py-2 border border-slate-200 rounded-lg"
        >
          {periodos.map(p => (
            <option key={p.id} value={p.id}>{p.mes}/{p.ano}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === 'alertas'} onClick={() => setTab('alertas')} icon={<Bell className="w-4 h-4" />} label="Alertas Pendentes" />
        <TabButton active={tab === 'config'} onClick={() => setTab('config')} icon={<Settings className="w-4 h-4" />} label="Configurações" />
      </div>

      {tab === 'alertas' && (
        <div className="space-y-6">
          {/* Próximas do prazo */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-slate-800">
                Etapas Próximas do Prazo ({etapasProximasPrazo.length})
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">Etapas que vencem nos próximos 3 dias</p>
            
            {etapasProximasPrazo.length === 0 ? (
              <p className="text-slate-500 text-center py-6">Nenhuma etapa próxima do prazo</p>
            ) : (
              <div className="space-y-2">
                {etapasProximasPrazo.map(etapa => {
                  const dias = differenceInDays(new Date(etapa.dataPrevista), hoje);
                  return (
                    <div key={etapa.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-800">{etapa.nome}</p>
                        <p className="text-sm text-slate-500">{etapa.responsavel || 'Sem responsável'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-yellow-700">
                          {dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias > 1 ? 's' : ''}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(etapa.dataPrevista), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Atrasadas */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-800">
                Etapas Atrasadas ({etapasAtrasadas.length})
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">Etapas com prazo vencido</p>
            
            {etapasAtrasadas.length === 0 ? (
              <p className="text-slate-500 text-center py-6">Nenhuma etapa atrasada</p>
            ) : (
              <div className="space-y-2">
                {etapasAtrasadas.map(etapa => {
                  const dias = differenceInDays(hoje, new Date(etapa.dataPrevista));
                  return (
                    <div key={etapa.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-800">{etapa.nome}</p>
                        <p className="text-sm text-slate-500">{etapa.responsavel || 'Sem responsável'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-700">
                          {dias} dia{dias > 1 ? 's' : ''} de atraso
                        </p>
                        <p className="text-xs text-slate-500">
                          Prevista: {format(new Date(etapa.dataPrevista), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Configurações de Notificação</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-500" />
                <div>
                  <p className="font-medium text-slate-800">Alertas por Email</p>
                  <p className="text-sm text-slate-500">Enviar emails quando etapas estiverem próximas do prazo</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-slate-500" />
                <div>
                  <p className="font-medium text-slate-800">Alertas de Atraso</p>
                  <p className="text-sm text-slate-500">Notificar quando etapas ficarem atrasadas</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="font-medium text-slate-800 mb-2">Dias de Antecedência</p>
              <p className="text-sm text-slate-500 mb-3">Quantos dias antes do prazo enviar alertas</p>
              <select className="px-3 py-2 border border-slate-200 rounded-lg" defaultValue="3">
                <option value="1">1 dia</option>
                <option value="2">2 dias</option>
                <option value="3">3 dias</option>
                <option value="5">5 dias</option>
              </select>
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
      className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
        active 
          ? 'border-primary-600 text-primary-600' 
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
