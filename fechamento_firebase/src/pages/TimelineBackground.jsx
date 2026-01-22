import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { format, addDays, startOfDay, differenceInDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TimelineBackground = forwardRef(({ 
  dataInicio = new Date(), 
  dias = 30, 
  renderSlot, 
  renderHeader, 
  intervalo = 1, 
  horaInicio = 0, 
  horaFim = 23, 
  alturaSlot = 128,
  conexoes = [],
  etapas = [] // Recebe a lista de etapas para calcular o índice dentro do slot
}, ref) => {
  const containerRef = useRef(null);
  const dataInicial = startOfDay(new Date(dataInicio));
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  
  // Gera o array de dias baseado na prop 'dias'
  const diasArray = Array.from({ length: dias }, (_, i) => addDays(dataInicial, i));
  const horas = [];
  for (let i = horaInicio; i <= horaFim; i += intervalo) {
    horas.push(i);
  }

  // Dimensões para o SVG de conexões
  const totalWidth = 64 + dias * 140; // 64px (header) + dias * 140px (coluna)
  const totalHeight = 49 + horas.length * alturaSlot; // 49px (header) + slots

  // Cálculos globais para a linha do tempo
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = horaInicio * 60;
  const endMinutes = (horaFim + intervalo) * 60;
  const offsetMinutes = currentMinutes - startMinutes;
  const isTimeVisible = offsetMinutes >= 0 && currentMinutes < endMinutes;
  const topPosition = 49 + (offsetMinutes * (alturaSlot / (intervalo * 60))); // 49px = altura do cabeçalho

  const centerOnNow = (behavior = 'smooth') => {
    if (containerRef.current) {
      const container = containerRef.current;
      // Busca o elemento da coluna do dia atual diretamente no DOM
      const todayColumn = container.querySelector('#current-day-column');

      if (todayColumn) {
        const { clientWidth, clientHeight } = container;

        // 1. Horizontal: Centraliza a coluna usando a posição real do elemento
        const targetLeft = todayColumn.offsetLeft - (clientWidth / 2) + (todayColumn.offsetWidth / 2);
        
        // 2. Vertical: Recalcula a posição da hora atual
        const nowInstant = new Date();
        const currentMinutes = nowInstant.getHours() * 60 + nowInstant.getMinutes();
        const startMinutes = horaInicio * 60;
        const offsetMinutes = currentMinutes - startMinutes;
        const topPosition = 49 + (offsetMinutes * (alturaSlot / (intervalo * 60)));
        const targetTop = topPosition - (clientHeight / 2);

        // Aplica o scroll em ambos os eixos
        container.scrollTo({ left: targetLeft, top: targetTop, behavior });
      }
    }
  };

  useImperativeHandle(ref, () => ({
    centerOnNow
  }));

  // Efeito para centralizar o scroll no dia e hora atuais ao montar/atualizar
  useEffect(() => {
    // Adiciona um pequeno delay para garantir que o container tenha as dimensões corretas
    setTimeout(() => centerOnNow('auto'), 100);
  }, [dataInicio, dias, horaInicio, alturaSlot]); // Recalcula se as props principais mudarem

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-white border border-slate-200 rounded-lg relative custom-scrollbar">
      <div className="flex min-w-max relative">
        {/* Coluna de Horas (Sticky Left) */}
        <div className="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 w-16 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
           {/* Canto superior esquerdo (vazio) */}
           <div className="h-[49px] border-b border-slate-200 bg-slate-100 sticky top-0 z-40 flex items-center justify-center text-xs font-semibold text-slate-500">
             Horário
           </div>
           
           {/* Labels das horas */}
           {horas.map(hora => (
             <div key={hora} style={{ height: `${alturaSlot}px` }} className="flex items-start justify-center pt-2 text-xs font-medium text-slate-500 border-b border-slate-100 bg-slate-50">
               {String(hora).padStart(2, '0')}:00
             </div>
           ))}
           
           {/* Indicador de Hora Atual (Bolinha na coluna fixa) */}
           {isTimeVisible && (
             <div 
               className="absolute right-0 w-full z-50 pointer-events-none flex justify-end"
               style={{ top: `${topPosition}px` }}
             >
               <div className="w-4 h-4 bg-red-600 rounded-full shadow-sm border-2 border-white translate-x-2 -translate-y-2"></div>
             </div>
           )}
        </div>

        {/* Colunas dos Dias */}
        {diasArray.map((dia) => {
          const isToday = isSameDay(dia, now);
          return (
          <div 
            id={isToday ? "current-day-column" : undefined}
            key={dia.toISOString()} 
            className={`flex flex-col min-w-[140px] border-r border-slate-200 shrink-0 z-10 ${isToday ? 'bg-slate-200' : 'bg-transparent'}`}
          >
            {/* Cabeçalho do Dia (Sticky Top) */}
            <div className={`sticky top-0 z-20 py-3 text-center border-b border-slate-400 font-semibold shadow-sm ${isToday ? 'bg-slate-300 text-slate-900' : 'bg-slate-50 text-slate-700'}`}>
              {format(dia, "dd 'de' MMM", { locale: ptBR })}
              {renderHeader && renderHeader({ date: dia })}
            </div>
            
            {/* Slots das Horas */}
            <div className="flex flex-col relative">
              {horas.map(hora => (
                <div key={hora} style={{ height: `${alturaSlot}px` }} className={`border-b border-slate-100 p-2 relative transition-colors group ${isToday ? 'hover:bg-slate-300' : 'hover:bg-slate-50'}`}>
                  {renderSlot && renderSlot({ date: dia, hour: hora })}
                </div>
              ))}
            </div>
          </div>
        )})}

        {/* Linha do Tempo Global (Atravessa toda a tabela) */}
        {isTimeVisible && (
          <div 
            className="absolute left-0 w-full border-t-2 border-dashed border-red-600 z-10 pointer-events-none"
            style={{ top: `${topPosition}px` }}
          />
        )}
      </div>
    </div>
  );
});

export default TimelineBackground;