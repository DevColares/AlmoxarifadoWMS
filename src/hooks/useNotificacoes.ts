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
    // Registra Service Worker para suportar notificações no Android (Chrome Mobile exige SW)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }, []);

  // Solicita permissão de notificação do navegador (funciona no Windows e Android)
  const solicitarPermissao = useCallback(async () => {
    if (!('Notification' in window)) return;
    try {
      const resultado = await Notification.requestPermission();
      setPermissao(resultado);
      return resultado;
    } catch {
      return Notification.permission;
    }
  }, []);

  // Toca um som de alerta via Web Audio API
  const tocarAlerta = useCallback((frequencia = 440, duracao = 0.3) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
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

      // Som de alerta e vibração (no Android)
      if (comAlerta) {
        if (tipo === 'sucesso') tocarAlerta(523, 0.25);
        else if (tipo === 'aviso') tocarAlerta(440, 0.4);
        else if (tipo === 'erro') tocarAlerta(220, 0.5);
        else tocarAlerta(392, 0.2);

        // Vibra o celular Android se suportado (padrão: vibra 200ms, pausa 100ms, vibra 200ms)
        if ('vibrate' in navigator) {
          try {
            navigator.vibrate([200, 100, 200]);
          } catch {}
        }
      }

      // Notificação nativa do sistema operacional (Windows / Android)
      if ('Notification' in window && Notification.permission === 'granted') {
        const icone = '/warehouse-icon.svg';
        const opcoes: NotificationOptions = {
          body: mensagem,
          icon: icone,
          badge: icone,
          tag: nova.id,
          requireInteraction: tipo === 'aviso' || tipo === 'sucesso',
        };

        // No Android, o Chrome EXIGE showNotification() através do ServiceWorker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(`WMS | ${titulo}`, opcoes);
          }).catch(() => {
            try {
              new Notification(`WMS | ${titulo}`, opcoes);
            } catch {}
          });
        } else {
          try {
            const nativa = new Notification(`WMS | ${titulo}`, opcoes);
            setTimeout(() => nativa.close(), 6000);
          } catch (_) {
            try {
              new Notification(`WMS | ${titulo}`, { body: mensagem });
            } catch {}
          }
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
