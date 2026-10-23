// src/components/ToastContainer.tsx
// Exibe as notificações internas (toasts) da aplicação

import React, { useEffect } from 'react';
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NotificacaoWMS } from '../types';

const ICONES: Record<NotificacaoWMS['tipo'], React.ReactNode> = {
  info:    <Info size={16} />,
  sucesso: <CheckCircle size={16} />,
  aviso:   <AlertTriangle size={16} />,
  erro:    <AlertCircle size={16} />,
};

function Toast({ n }: { n: NotificacaoWMS }) {
  const { removerNotificacao } = useApp();

  useEffect(() => {
    const t = setTimeout(() => removerNotificacao(n.id), 6000);
    return () => clearTimeout(t);
  }, [n.id, removerNotificacao]);

  return (
    <div className={`toast ${n.tipo}`} role="alert" aria-live="polite">
      <span style={{ color: 'var(--clr-muted)', flexShrink: 0, paddingTop: 2 }}>
        {ICONES[n.tipo]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="toast-titulo">{n.titulo}</div>
        <div className="toast-msg">{n.mensagem}</div>
      </div>
      <button
        className="toast-close"
        onClick={() => removerNotificacao(n.id)}
        aria-label="Fechar notificação"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { notificacoes } = useApp();
  if (!notificacoes.length) return null;

  return (
    <div className="toast-container" aria-label="Notificações">
      {notificacoes.map((n) => (
        <Toast key={n.id} n={n} />
      ))}
    </div>
  );
}
