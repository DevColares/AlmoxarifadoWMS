// src/views/ChecklistSeparacao.tsx
// Tela de checklist para o operador executar a separação

import React, { useState, useEffect } from 'react';
import {
  Clock, Pause, Play, CheckSquare, Square, MapPin,
  Package, AlertCircle, ChevronLeft, Check, Truck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCronometro } from '../hooks/useCronometro';
import {
  atualizarItem, pausarSeparacao, retomarSeparacao, concluirSeparacao
} from '../firebase/firestore';
import { ItemRequisicao, Requisicao } from '../types';

// Modal de pausa
function ModalPausa({
  onConfirmar, onCancelar
}: { onConfirmar: (motivo: string) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const motivos = [
    'Divergência de saldo no estoque',
    'Falta de etiqueta',
    'Consulta ao líder',
    'Problema de localização',
    'Pausa para refeição',
    'Outro motivo',
  ];
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Pausar separação">
      <div className="modal">
        <h2 className="modal-titulo flex items-center gap-2">
          <Pause size={20} className="text-amber" /> Motivo da Pausa
        </h2>
        <div className="form-group mb-4">
          <label className="form-label">Selecione ou escreva o motivo:</label>
          <select
            id="select-motivo-pausa"
            className="form-select mb-3"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          >
            <option value="">Selecione…</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            id="input-motivo-pausa"
            type="text"
            className="form-input"
            placeholder="Ou digite o motivo…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-label="Motivo da pausa"
          />
        </div>
        <div className="flex gap-3">
          <button
            id="btn-confirmar-pausa"
            className="btn btn-amber flex-1"
            onClick={() => motivo.trim() && onConfirmar(motivo)}
            disabled={!motivo.trim()}
          >
            <Pause size={14} /> Pausar
          </button>
          <button id="btn-cancelar-pausa" className="btn btn-ghost flex-1" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChecklistSeparacao() {
  const {
    requisicaoSelecionada,
    setRequisicaoSelecionada,
    setViewAtual,
    enviarNotificacao,
    operadorAtivo,
    requisicoes,
    solicitarConfirmacao,
  } = useApp();
  const [mostrarModalPausa, setMostrarModalPausa] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Usar a requisição atualizada em tempo real do contexto
  const req: Requisicao | null = requisicaoSelecionada
    ? (requisicoes.find((r) => r.id === requisicaoSelecionada.id) ?? requisicaoSelecionada)
    : null;

  const { segundos, formatado } = useCronometro({
    dataInicio: req?.data_inicio ?? null,
    tempoAcumuladoSegundos: req?.tempo_segundos ?? 0,
    ativo: req?.status === 'EM_SEPARACAO',
  });

  if (!req) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon"><CheckSquare size={72} /></div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Nenhuma separação ativa</h2>
          <p className="text-sm">Vá ao Painel e assuma uma requisição para iniciar.</p>
          <button className="btn btn-primary" onClick={() => setViewAtual('painel')}>
            <ChevronLeft size={15} /> Ver Painel
          </button>
        </div>
      </main>
    );
  }

  const itens = req.itens;
  const itensSeparados = itens.filter((i) => i.separado).length;
  const total = itens.length;
  const progresso = total > 0 ? (itensSeparados / total) * 100 : 0;
  const tudoSeparado = itensSeparados === total && total > 0;
  const isPausado = req.status === 'PAUSADO';
  const isAguardando = req.status === 'AGUARDANDO_RETIRADA';
  const meuPedido = req.separador_id === operadorAtivo.id;

  const toggleItem = async (idx: number) => {
    if (!meuPedido || isPausado || isAguardando) return;
    setSalvando(true);
    const novosItens: ItemRequisicao[] = itens.map((item, i) =>
      i === idx ? { ...item, separado: !item.separado } : item
    );
    try {
      await atualizarItem(req.id, novosItens);
    } catch {
      enviarNotificacao('Erro', 'Não foi possível atualizar o item.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const handlePausar = async (motivo: string) => {
    setMostrarModalPausa(false);
    setSalvando(true);
    try {
      await pausarSeparacao(req.id, motivo, segundos);
    } catch {
      enviarNotificacao('Erro', 'Não foi possível pausar.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const handleRetomar = async () => {
    setSalvando(true);
    try {
      await retomarSeparacao(req.id);
    } catch {
      enviarNotificacao('Erro', 'Não foi possível retomar.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const handleConcluir = () => {
    solicitarConfirmacao({
      titulo: 'Concluir Separação',
      mensagem: `Confirmar conclusão da separação de ${req.numero_nota}?\n\n• ${itensSeparados} de ${total} itens separados.\n• Tempo gasto: ${formatado}`,
      tipo: 'sucesso',
      textoConfirmar: 'Sim, Concluir Separação',
      textoCancelar: 'Revisar',
      onConfirmar: async () => {
        setSalvando(true);
        try {
          await concluirSeparacao(req.id, segundos);
          enviarNotificacao('Separação Concluída', `Nota ${req.numero_nota} pronta para retirada!`, 'sucesso');
          setViewAtual('painel');
        } catch {
          enviarNotificacao('Erro', 'Não foi possível concluir.', 'erro');
        } finally {
          setSalvando(false);
        }
      },
    });
  };

  return (
    <main className="main-content">
      {mostrarModalPausa && (
        <ModalPausa
          onConfirmar={handlePausar}
          onCancelar={() => setMostrarModalPausa(false)}
        />
      )}

      {/* Cabeçalho da separação */}
      <div className="card mb-4" style={{ background: isPausado ? 'rgba(245,158,11,.07)' : 'var(--clr-surface)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            id="btn-voltar-checklist"
            className="btn btn-ghost btn-sm"
            onClick={() => setViewAtual('painel')}
            aria-label="Voltar ao painel"
          >
            <ChevronLeft size={15} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="font-bold truncate" style={{ fontSize: '1.15rem' }}>
              {req.numero_nota}
            </h1>
            <p className="text-sm text-muted truncate">{req.solicitante}</p>
          </div>

          {/* Cronômetro grande */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '.6rem', color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {isPausado ? '⏸ Pausa' : '⏱ Tempo'}
            </div>
            <div className={`cronometro ${isPausado ? 'pausado' : ''}`} aria-label={`Tempo de separação: ${formatado}`}>
              {formatado}
            </div>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted mb-2">
            <span className="flex items-center gap-1">
              <CheckSquare size={12} /> {itensSeparados} de {total} itens separados
            </span>
            <span className={progresso === 100 ? 'text-emerald font-bold' : ''}>
              {Math.round(progresso)}%
            </span>
          </div>
          <div className="progress-bar-wrap" role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar" style={{ width: `${progresso}%` }} />
          </div>
        </div>

        {/* Ações */}
        {!isAguardando && meuPedido && (
          <div className="flex gap-2 flex-wrap">
            {isPausado ? (
              <button
                id="btn-retomar-separacao"
                className="btn btn-primary"
                onClick={handleRetomar}
                disabled={salvando}
              >
                <Play size={14} /> Retomar
              </button>
            ) : (
              <button
                id="btn-pausar-separacao"
                className="btn btn-amber"
                onClick={() => setMostrarModalPausa(true)}
                disabled={salvando}
              >
                <Pause size={14} /> Pausar
              </button>
            )}

            <button
              id="btn-concluir-separacao"
              className="btn btn-primary"
              onClick={handleConcluir}
              disabled={!tudoSeparado || salvando || isPausado}
              title={!tudoSeparado ? 'Separe todos os itens primeiro' : 'Concluir separação'}
            >
              <Check size={14} /> Concluir Separação
            </button>
          </div>
        )}

        {isAguardando && (
          <div style={{
            background: 'var(--clr-sky-glow)',
            border: '1px solid var(--clr-sky)',
            borderRadius: 'var(--radius)',
            padding: '.65rem .85rem',
            fontSize: '.875rem',
            color: 'var(--clr-sky)',
            display: 'flex', alignItems: 'center', gap: '.5rem'
          }}>
            <Truck size={16} />
            Aguardando retirada pelo cliente — acesse o Painel para entregar.
          </div>
        )}
      </div>

      {/* Lista de itens */}
      <div>
        <div className="section-title">
          <Package size={14} /> Itens da Requisição
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {itens.map((item, idx) => (
            <div
              key={`${item.codigo}-${idx}`}
              id={`checklist-item-${idx}`}
              className={`checklist-item ${item.separado ? 'separado' : ''}`}
              onClick={() => toggleItem(idx)}
              role="checkbox"
              aria-checked={item.separado}
              aria-label={`${item.nome} - ${item.quantidade}`}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleItem(idx); } }}
            >
              {/* Checkbox visual */}
              <div className={`checklist-checkbox ${item.separado ? 'checked' : ''}`} aria-hidden="true">
                {item.separado && <Check size={13} color="#fff" strokeWidth={3} />}
              </div>

              {/* Localização */}
              <span className="item-localizacao" aria-label={`Localização: ${item.localizacao}`}>
                <MapPin size={11} style={{ display: 'inline', marginRight: '.2rem' }} />
                {item.localizacao}
              </span>

              {/* Info do item com Cód. Peça maior que a descrição e Quantidade em destaque com 'und' */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className="font-mono font-bold"
                    style={{
                      fontSize: '1.25rem',
                      letterSpacing: '0.03em',
                      color: item.separado ? 'var(--clr-muted)' : 'var(--clr-primary, #818cf8)'
                    }}
                  >
                    {item.codigo}
                  </span>
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.65rem',
                      borderRadius: '6px',
                      background: item.separado ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.22)',
                      color: 'var(--clr-emerald, #10b981)',
                      border: '1px solid rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    {item.quantidade.toLowerCase().includes('und') ? item.quantidade : `${item.quantidade} und`}
                  </span>
                </div>
                <div
                  className="item-nome truncate"
                  style={{ color: 'var(--clr-muted)', fontSize: '0.85rem' }}
                  title={item.nome}
                >
                  {item.nome}
                </div>
              </div>

              {item.separado && (
                <div style={{ color: 'var(--clr-emerald)', flexShrink: 0 }}>
                  <Check size={18} strokeWidth={3} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
