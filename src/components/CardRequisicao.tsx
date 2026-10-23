// src/components/CardRequisicao.tsx
// Card individual de uma requisição na fila geral

import React, { useState } from 'react';
import {
  Clock, UserCheck, Truck, Pause, Play, CheckSquare,
  MapPin, Package, ChevronRight, Zap
} from 'lucide-react';
import { Requisicao } from '../types';
import { useApp } from '../context/AppContext';
import { assumirSeparacao, entregarMaterial } from '../firebase/firestore';
import { useCronometro } from '../hooks/useCronometro';

interface Props {
  req: Requisicao;
}

function Cronometro({ req }: { req: Requisicao }) {
  const { formatado } = useCronometro({
    dataInicio: req.data_inicio,
    tempoAcumuladoSegundos: req.tempo_segundos,
    ativo: req.status === 'EM_SEPARACAO',
  });
  return (
    <span className={`font-mono font-bold ${req.status === 'PAUSADO' ? 'text-amber' : 'text-emerald'}`}>
      {formatado}
    </span>
  );
}

export function CardRequisicao({ req }: Props) {
  const { operadorAtivo, setViewAtual, setRequisicaoSelecionada, enviarNotificacao, solicitarConfirmacao } = useApp();
  const [carregando, setCarregando] = useState(false);

  const totalItens = req.itens.length;
  const itensSeparados = req.itens.filter((i) => i.separado).length;
  const progresso = totalItens > 0 ? (itensSeparados / totalItens) * 100 : 0;

  const isAguardando = req.status === 'AGUARDANDO_RETIRADA';
  const isEmSeparacao = req.status === 'EM_SEPARACAO';
  const isPendente = req.status === 'PENDENTE';
  const isPausado = req.status === 'PAUSADO';

  const podeContinuar =
    (isEmSeparacao || isPausado) && req.separador_id === operadorAtivo.id;
  const podeAssumir = isPendente || (isPausado && req.separador_id !== operadorAtivo.id);

  const handleAssumir = async () => {
    setCarregando(true);
    try {
      await assumirSeparacao(req.id, operadorAtivo.id, operadorAtivo.nome);
      setRequisicaoSelecionada({ ...req, status: 'EM_SEPARACAO' });
      setViewAtual('checklist');
    } catch (e) {
      enviarNotificacao('Erro', 'Não foi possível assumir a separação.', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const handleContinuar = () => {
    setRequisicaoSelecionada(req);
    setViewAtual('checklist');
  };

  const handleEntregar = () => {
    solicitarConfirmacao({
      titulo: 'Confirmar Entrega de Material',
      mensagem: `Deseja registrar a entrega da Nota ${req.numero_nota} ao solicitante (${req.solicitante})?`,
      tipo: 'sucesso',
      textoConfirmar: 'Confirmar Entrega',
      textoCancelar: 'Voltar',
      onConfirmar: async () => {
        setCarregando(true);
        try {
          await entregarMaterial(req.id);
          enviarNotificacao('Material Entregue', `Nota ${req.numero_nota} entregue com sucesso!`, 'sucesso');
        } catch (e) {
          enviarNotificacao('Erro', 'Não foi possível registrar a entrega.', 'erro');
        } finally {
          setCarregando(false);
        }
      },
    });
  };

  const statusLabel: Record<string, string> = {
    PENDENTE: 'Pendente',
    EM_SEPARACAO: 'Em Separação',
    PAUSADO: 'Pausado',
    AGUARDANDO_RETIRADA: 'Aguardando Retirada',
    ENTREGUE: 'Entregue',
  };

  return (
    <article
      className={`card ${isAguardando ? 'aguardando' : isEmSeparacao ? 'destaque' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      aria-label={`Requisição ${req.numero_nota}`}
    >
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span className={`badge-status ${req.status}`} aria-label={`Status: ${statusLabel[req.status]}`}>
              {req.status === 'AGUARDANDO_RETIRADA' ? (
                <><Zap size={10} />{statusLabel[req.status]}</>
              ) : statusLabel[req.status]}
            </span>
          </div>
          <h3 className="font-bold truncate" style={{ fontSize: '1.05rem' }}>
            {req.numero_nota}
          </h3>
          <p className="text-sm text-muted truncate">{req.solicitante}</p>
        </div>

        {/* Cronômetro se em separação/pausado */}
        {(isEmSeparacao || isPausado) && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '.65rem', color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.1rem' }}>
              {isPausado ? '⏸ Pausado' : '⏱ Tempo'}
            </div>
            <Cronometro req={req} />
          </div>
        )}
      </div>

      {/* Separador/Operador */}
      {req.separador_nome && (
        <div className="flex items-center gap-2" style={{ fontSize: '.8rem', color: 'var(--clr-muted)' }}>
          <UserCheck size={14} className="text-emerald" />
          <span>
            {isEmSeparacao ? 'Separando: ' : isPausado ? 'Pausa por: ' : 'Por: '}
            <strong style={{ color: 'var(--clr-text)' }}>{req.separador_nome}</strong>
          </span>
        </div>
      )}

      {/* Motivo de pausa */}
      {isPausado && req.motivo_pausa && (
        <div style={{
          background: 'var(--clr-amber-glow)',
          border: '1px solid var(--clr-amber)',
          borderRadius: 'var(--radius)',
          padding: '.5rem .75rem',
          fontSize: '.8rem',
          color: 'var(--clr-amber)',
        }}>
          <Pause size={12} style={{ display: 'inline', marginRight: '.35rem' }} />
          {req.motivo_pausa}
        </div>
      )}

      {/* Progresso */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted mb-2">
          <span className="flex items-center gap-1">
            <CheckSquare size={12} /> {itensSeparados}/{totalItens} itens
          </span>
          <span>{Math.round(progresso)}%</span>
        </div>
        <div className="progress-bar-wrap" role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${progresso}%` }} />
        </div>
      </div>

      {/* Itens (preview) */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <MapPin size={12} />
        <span>
          {req.itens.slice(0, 2).map((i) => i.localizacao).join(', ')}
          {req.itens.length > 2 && ` +${req.itens.length - 2} locais`}
        </span>
      </div>

      {/* Rodapé com ações */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: 'auto' }}>
        {/* Entregue aguardando retirada */}
        {isAguardando && (
          <button
            id={`btn-entregar-${req.id}`}
            className="btn btn-sky btn-full"
            onClick={handleEntregar}
            disabled={carregando}
            aria-label="Confirmar entrega ao cliente"
          >
            <Truck size={15} />
            Cliente Chegou! Entregar Material
          </button>
        )}

        {/* Assumir */}
        {podeAssumir && (
          <button
            id={`btn-assumir-${req.id}`}
            className="btn btn-primary btn-full"
            onClick={handleAssumir}
            disabled={carregando}
            aria-label={`Assumir separação da ${req.numero_nota}`}
          >
            <UserCheck size={15} />
            Assumir Separação ({operadorAtivo.nome.split(' ')[0]})
          </button>
        )}

        {/* Continuar */}
        {podeContinuar && (
          <button
            id={`btn-continuar-${req.id}`}
            className="btn btn-indigo btn-full"
            onClick={handleContinuar}
            aria-label="Continuar separação"
          >
            {isPausado ? <Play size={15} /> : <ChevronRight size={15} />}
            {isPausado ? 'Retomar Separação' : 'Continuar Separação'}
          </button>
        )}
      </div>
    </article>
  );
}
