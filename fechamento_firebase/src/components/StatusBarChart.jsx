import React from 'react';

const StatusBarChart = ({ data }) => {
  const {
    concluidas = 0,
    concluidasComAtraso = 0,
    emAndamento = 0,
    pendentes = 0,
    atrasadas = 0,
    total = 0,
  } = data || {};

  if (total === 0) {
    return (
      <div className="h-10 bg-slate-100 rounded-lg flex items-center justify-center">
        <p className="text-sm text-slate-500">Nenhuma etapa para exibir</p>
      </div>
    );
  }

  const segments = [
    { value: concluidas, color: 'bg-green-500', label: 'Concluídas' },
    { value: concluidasComAtraso, color: 'bg-orange-500', label: 'Concluídas com Atraso' },
    { value: emAndamento, color: 'bg-blue-500', label: 'Em Andamento' },
    { value: pendentes, color: 'bg-yellow-500', label: 'Pendentes' },
    { value: atrasadas, color: 'bg-red-500', label: 'Atrasadas' },
  ];

  return (
    <div>
      <div className="h-8 flex rounded-lg overflow-hidden mb-4" title={`Progresso Total: ${((concluidas / total) * 100).toFixed(0)}%`}>
        {segments.map((segment, index) => {
          if (segment.value === 0) return null;
          const percentage = (segment.value / total) * 100;
          return (
            <div
              key={index}
              className={`h-full ${segment.color} transition-all duration-500 hover:opacity-90`}
              style={{ width: `${percentage}%` }}
              title={`${segment.label}: ${segment.value} (${percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {segments.map((segment, index) => {
          if (segment.value === 0) return null;
          return (
            <div key={index} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${segment.color}`} />
              <span className="text-slate-600">{segment.label}: <strong>{segment.value}</strong></span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusBarChart;
