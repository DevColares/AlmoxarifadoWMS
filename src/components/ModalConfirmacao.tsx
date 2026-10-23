// src/components/ModalConfirmacao.tsx
// Modal customizado no design system do WMS para substituir window.confirm/alert

import React from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, X, Info } from 'lucide-react';

export interface ModalConfirmacaoConfig {
  titulo: string;
  mensagem: string | React.ReactNode;
  tipo?: 'perigo' | 'sucesso' | 'aviso' | 'info';
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar?: () => void;
}

interface Props {
  aberto: boolean;
  config: ModalConfirmacaoConfig | null;
  aoFechar: () => void;
}

export function ModalConfirmacao({ aberto, config, aoFechar }: Props) {
  if (!aberto || !config) return null;

  const tipo = config.tipo || 'info';

  const icones = {
    perigo: <AlertCircle size={24} className="text-rose" />,
    sucesso: <CheckCircle2 size={24} className="text-emerald" />,
    aviso: <AlertCircle size={24} className="text-amber" />,
    info: <HelpCircle size={24} className="text-sky" />,
  };

  const botaoConfirmarClasse = {
    perigo: 'btn btn-rose',
    sucesso: 'btn btn-primary',
    aviso: 'btn btn-amber',
    info: 'btn btn-primary',
  }[tipo];

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={aoFechar}
    >
      <div
        className="modal"
        style={{ maxWidth: '440px', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn btn-ghost btn-sm"
          style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '.4rem' }}
          onClick={() => {
            if (config.onCancelar) config.onCancelar();
            aoFechar();
          }}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--clr-surface2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icones[tipo]}
          </div>
          <div>
            <h3 className="font-bold text-base" style={{ margin: 0 }}>
              {config.titulo}
            </h3>
          </div>
        </div>

        <div className="text-sm text-muted mb-5" style={{ lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {config.mensagem}
        </div>

        <div className="flex gap-2 justify-end">
          {config.textoCancelar !== '' && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (config.onCancelar) config.onCancelar();
                aoFechar();
              }}
            >
              {config.textoCancelar || 'Cancelar'}
            </button>
          )}
          <button
            className={botaoConfirmarClasse}
            onClick={() => {
              config.onConfirmar();
              aoFechar();
            }}
            autoFocus
          >
            {config.textoConfirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
