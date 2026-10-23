// src/hooks/useCronometro.ts
// Hook para gerenciar o cronômetro de separação em tempo real

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCronometroParams {
  dataInicio: string | null;
  tempoAcumuladoSegundos: number;
  ativo: boolean; // true quando status === 'EM_SEPARACAO'
}

export function useCronometro({
  dataInicio,
  tempoAcumuladoSegundos,
  ativo,
}: UseCronometroParams) {
  const [segundos, setSegundos] = useState(tempoAcumuladoSegundos);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const calcularSegundos = useCallback(() => {
    if (!dataInicio || !ativo) return tempoAcumuladoSegundos;
    const inicio = new Date(dataInicio).getTime();
    const agora = Date.now();
    const diff = Math.floor((agora - inicio) / 1000);
    return tempoAcumuladoSegundos + diff;
  }, [dataInicio, tempoAcumuladoSegundos, ativo]);

  useEffect(() => {
    setSegundos(calcularSegundos());

    if (ativo && dataInicio) {
      intervalRef.current = setInterval(() => {
        setSegundos(calcularSegundos());
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ativo, dataInicio, tempoAcumuladoSegundos, calcularSegundos]);

  const formatar = (s: number): string => {
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return {
    segundos,
    formatado: formatar(segundos),
  };
}
