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
  larguraColuna = 450,
  conexoes = [],
  etapas = [] 
}, ref) => {
  const containerRef = useRef(null);
  const dataInicial = startOfDay(new Date(dataInicio));
  const [now, setNow] = useState(new Date());

  const [isExpanded, setIsExpanded] = useState(false);

  const expandedAlturaSlot = 256;
  const currentAlturaSlot = isExpanded ? expandedAlturaSlot : alturaSlot;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  
  const diasArray = Array.from({ length: dias }, (_, i) => addDays(dataInicial, i));
  const horas = [];
  for (let i = horaInicio; i <= horaFim; i += intervalo) {
    horas.push(i);
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = horaInicio * 60;
  const endMinutes = (horaFim + intervalo) * 60;
  const offsetMinutes = currentMinutes - startMinutes;
  const isTimeVisible = offsetMinutes >= 0 && currentMinutes < endMinutes;
  const topPosition = 49 + (offsetMinutes * (currentAlturaSlot / (intervalo * 60)));

  const centerOnNow = (behavior = 'smooth') => {
    if (containerRef.current) {
      const container = containerRef.current;
      const todayColumn = container.querySelector('#current-day-column');

      if (todayColumn) {
        const { clientWidth, clientHeight } = container;
        const targetLeft = todayColumn.offsetLeft - (clientWidth / 2) + (todayColumn.offsetWidth / 2);
        const nowInstant = new Date();
        const currentMinutes = nowInstant.getHours() * 60 + nowInstant.getMinutes();
        const startMinutes = horaInicio * 60;
        const offsetMinutes = currentMinutes - startMinutes;
        const topPosition = 49 + (offsetMinutes * (currentAlturaSlot / (intervalo * 60)));
        const targetTop = topPosition - (clientHeight / 2);
        container.scrollTo({ left: targetLeft, top: targetTop, behavior });
      }
    }
  };

  useImperativeHandle(ref, () => ({
    centerOnNow
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      centerOnNow('auto');
    }, 300);
    return () => clearTimeout(timer);
  }, [dataInicio, currentAlturaSlot]);

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-white border border-slate-200 rounded-lg relative custom-scrollbar">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute top-2 right-2 z-50 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold py-1 px-3 rounded-full shadow-md"
      >
        {isExpanded ? 'Recolher' : 'Expandir'}
      </button>
      <div className="flex min-w-max relative">
        {/* Coluna de Horas */}
        <div className="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 w-16 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
           <div className="h-[49px] border-b border-slate-200 bg-slate-100 sticky top-0 z-40 flex items-center justify-center text-xs font-semibold text-slate-500">
             Horário
           </div>
           
           {horas.map(hora => (
             <div key={hora} style={{ height: `${currentAlturaSlot}px` }} className="flex items-start justify-center pt-2 text-xs font-medium text-slate-500 border-b border-slate-100 bg-slate-50">
               {String(hora).padStart(2, '0')}:00
             </div>
           ))}
           
           {isTimeVisible && (
             <div 
               className="absolute right-0 w-full z-50 pointer-events-none flex justify-end items-center"
               style={{ top: `${topPosition}px` }}
             >
                <span className="text-xs font-semibold text-red-600 mr-2 bg-white bg-opacity-75 rounded-md px-1">{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span>
               <div className="w-4 h-4 bg-red-600 rounded-full shadow-sm border-2 border-white translate-x-2"></div>
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
            style={{ width: larguraColuna, minWidth: larguraColuna }}
            className={`flex flex-col border-r border-slate-200 shrink-0 z-10 ${isToday ? 'bg-blue-100' : 'bg-transparent'}`}
          >
            <div className={`sticky top-0 z-20 py-3 text-center border-b border-slate-400 font-semibold shadow-sm ${isToday ? 'bg-blue-200 text-blue-800' : 'bg-slate-50 text-slate-700'}`}>
              {format(dia, "dd 'de' MMM", { locale: ptBR })}
              {renderHeader && renderHeader({ date: dia })}
            </div>
            
            <div className="flex flex-col relative">
              {horas.map(hora => (
                <div key={hora} style={{ height: `${currentAlturaSlot}px` }} className={`border-b border-slate-100 p-1 relative transition-colors group ${isToday ? 'hover:bg-blue-200' : 'hover:bg-slate-50'}`}>
                  {renderSlot && renderSlot({ date: dia, hour: hora })}
                </div>
              ))}
            </div>
          </div>
        )})}

        {isTimeVisible && (
          <div 
            className="absolute left-0 w-full border-t-2 border-dashed border-red-600 z-10 pointer-events-none"
            style={{ top: `${topPosition}px` }}
          />
        )}
      </div>

      <style>{`
        /* Custom Scrollbar - Consistente em ambos os componentes */
        .custom-scrollbar::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
          border: 3px solid #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
});

export default TimelineBackground;
