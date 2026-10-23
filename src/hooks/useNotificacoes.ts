// src/hooks/useNotificacoes.ts
// Hook para notificações nativas (Web Notifications API) - Windows e Android

import { useCallback, useEffect, useRef, useState } from 'react';
import { NotificacaoWMS } from '../types';

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoWMS[]>([]);
  const [permissao, setPermissao] = useState<NotificationPermission>('default');
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermissao(Notification.permission);
    }
  }, []);

  // Solicita permissão de notificação do navegador (funciona no Windows e Android)
  const solicitarPermissao = useCallback(async () => {
    if (!('Notification' in window)) return;
    const resultado = await Notification.requestPermission();
    setPermissao(resultado);
    return resultado;
  }, []);

  // Toca um som de alerta via Web Audio API
  const tocarAlerta = useCallback((frequencia = 440, duracao = 0.3) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      const oscilador = ctx.createOscillator();
      const ganho = ctx.createGain();
      oscilador.connect(ganho);
      ganho.connect(ctx.destination);
      oscilador.frequency.value = frequencia;
      oscilador.type = 'sine';
      ganho.gain.setValueAtTime(0.4, ctx.currentTime);
      ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duracao);
      oscilador.start(ctx.currentTime);
      oscilador.stop(ctx.currentTime + duracao);
    } catch (_) {
      // ignorar erros de áudio em ambientes sem suporte
    }
  }, []);

  // Envia uma notificação nativa e adiciona à fila interna
  const enviarNotificacao = useCallback(
    (
      titulo: string,
      mensagem: string,
      tipo: NotificacaoWMS['tipo'] = 'info',
      comAlerta = true
    ) => {
      // Notificação interna (toast)
      const nova: NotificacaoWMS = {
        id: Date.now().toString(),
        titulo,
        mensagem,
        tipo,
        timestamp: Date.now(),
      };
      setNotificacoes((prev) => [nova, ...prev].slice(0, 5));

      // Som de alerta
      if (comAlerta) {
        if (tipo === 'sucesso') tocarAlerta(523, 0.25);
        else if (tipo === 'aviso') tocarAlerta(440, 0.4);
        else if (tipo === 'erro') tocarAlerta(220, 0.5);
        else tocarAlerta(392, 0.2);
      }

      // Notificação nativa do sistema operacional (Windows / Android)
      if ('Notification' in window && Notification.permission === 'granted') {
        const icone = '/warehouse-icon.svg';
        try {
          const nativa = new Notification(`WMS | ${titulo}`, {
            body: mensagem,
            icon: icone,
            badge: icone,
            tag: nova.id,
            // silent: false para Android tocar o som do sistema
          });
          // Fecha automaticamente após 6 segundos
          setTimeout(() => nativa.close(), 6000);
        } catch (_) {
          // Safari e alguns browsers não suportam todas as propriedades
          new Notification(`WMS | ${titulo}`, { body: mensagem });
        }
      }

      return nova.id;
    },
    [tocarAlerta]
  );

  // Remove uma notificação da fila interna
  const removerNotificacao = useCallback((id: string) => {
    setNotificacoes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notificacoes,
    permissao,
    solicitarPermissao,
    enviarNotificacao,
    removerNotificacao,
  };
}
