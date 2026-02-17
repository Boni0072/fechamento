import { useState, useEffect, useMemo } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissao } from '../hooks/usePermissao';
import { getHistorico } from '../services/database';
import { History, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { checkPermission } from './permissionUtils';

export default function Historico() {
  const { empresaAtual, empresas } = useAuth();
  const { loading: loadingPermissoes, user: authUser } = usePermissao('historico');
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [historico, setHistorico] = useState([]);
  const [tab, setTab] = useState('timeline');

  const empresasParaBuscar = useMemo(() => {
    if (empresaAtual) return [empresaAtual];
    return empresas || [];
  }, [empresaAtual, empresas]);

  useEffect(() => {
    if (authUser?.id && empresaAtual?.id) {
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
  
  // Restrição removida
  const autorizado = true;

  useEffect(() => {
    if (!empresasParaBuscar || empresasParaBuscar.length === 0) {
        setHistorico([]);
        return;
    };

    const unsubscribes = [];
    const historicoMap = new Map();

    empresasParaBuscar.forEach(emp => {
      const unsub = getHistorico(emp.id, (data) => {
        data.forEach(item => historicoMap.set(item.id, item));
        
        const allHistorico = Array.from(historicoMap.values()).sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        setHistorico(allHistorico);
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [empresasParaBuscar]);

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

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Histórico de Alterações</h1>
          <p className="text-slate-500">Auditoria de todas as modificações nas etapas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')} icon={<Clock className="w-4 h-4" />} label="Timeline" />
        <TabButton active={tab === 'tabela'} onClick={() => setTab('tabela')} icon={<History className="w-4 h-4" />} label="Tabela Detalhada" />
      </div>

      {tab === 'timeline' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Atividade Recente</h2>
          
          {historico.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhuma alteração registrada</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              
              <div className="space-y-4">
                {historico.slice(0, 20).map((item, index) => (
                  <div key={item.id} className="relative flex gap-4 pl-10">
                    <div className="absolute left-2 w-4 h-4 bg-primary-500 rounded-full border-2 border-white" />
                    
                    <div className="flex-1 bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-800">{item.userName || 'Usuário'}</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {format(new Date(item.timestamp), "MM/dd/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      
                      <p className="text-sm text-slate-600">
                        {item.acao === 'atualizacao' ? 'Atualizou' : item.acao} a etapa
                        {item.dados?.nome && <strong> "{item.dados.nome}"</strong>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tabela' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data/Hora</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ação</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Etapa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historico.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma alteração registrada
                  </td>
                </tr>
              ) : (
                historico.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {format(new Date(item.timestamp), "MM/dd/yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800">{item.userName || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs">
                        {item.acao === 'atualizacao' ? 'Atualização' : item.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.dados?.nome || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
