// src/components/CardRequisicao.tsx
// Card individual de uma requisição na fila geral

import React, { useState } from 'react';
import {
  UserCheck, Truck, Pause, Play, CheckSquare,
  MapPin, Package, ChevronRight, Zap, ChevronDown, ChevronUp, Check
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
  const [listaExpandida, setListaExpandida] = useState(false);

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

  const isOS = req.tipo_documento === 'OS' || /\bOS\b/i.test(req.numero_nota);

  return (
    <article
      className={`card ${isAguardando ? 'aguardando' : isEmSeparacao ? 'destaque' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        borderLeft: isOS ? '5px solid #f43f5e' : '5px solid #38bdf8',
        background: isOS ? 'rgba(244, 63, 94, 0.03)' : 'var(--clr-surface)'
      }}
      aria-label={`Requisição ${req.numero_nota}`}
    >
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Badge de Diferenciação OS vs NF */}
            {isOS ? (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: 'rgba(244, 63, 94, 0.18)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.45)',
                  textTransform: 'uppercase'
                }}
              >
                🛠️ O.S. (SERVIÇO)
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  textTransform: 'uppercase'
                }}
              >
                📄 NF VENDA
              </span>
            )}

            <span className={`badge-status ${req.status}`} aria-label={`Status: ${statusLabel[req.status]}`}>
              {req.status === 'AGUARDANDO_RETIRADA' ? (
                <><Zap size={10} />{statusLabel[req.status]}</>
              ) : statusLabel[req.status]}
            </span>
          </div>
          <h3 className="font-bold truncate" style={{ fontSize: '1.05rem', color: isOS ? '#f43f5e' : 'inherit' }}>
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

      {/* Itens (preview de localizações) */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <MapPin size={12} />
        <span>
          {req.itens.slice(0, 2).map((i) => i.localizacao).join(', ')}
          {req.itens.length > 2 && ` +${req.itens.length - 2} locais`}
        </span>
      </div>

      {/* Botão toggle lista de materiais */}
      <button
        className="btn btn-ghost btn-sm"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '.4rem',
          fontSize: '.78rem',
          color: 'var(--clr-muted)',
          borderTop: '1px solid var(--clr-border)',
          paddingTop: '.5rem',
          marginTop: '-.25rem',
          borderRadius: 0,
        }}
        onClick={() => setListaExpandida((v) => !v)}
        aria-expanded={listaExpandida}
        aria-controls={`lista-itens-${req.id}`}
      >
        <Package size={13} />
        {listaExpandida ? 'Ocultar materiais' : `Ver ${req.itens.length} ${req.itens.length === 1 ? 'material' : 'materiais'}`}
        {listaExpandida ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* Lista de materiais expandida */}
      {listaExpandida && (
        <div
          id={`lista-itens-${req.id}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginTop: '-.25rem' }}
          aria-label="Lista de materiais"
        >
          {req.itens.map((item, idx) => (
            <div
              key={`${item.codigo}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                padding: '.45rem .6rem',
                borderRadius: 'var(--radius)',
                background: item.separado
                  ? 'rgba(16, 185, 129, 0.07)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${item.separado ? 'rgba(16,185,129,0.25)' : 'var(--clr-border)'}`,
                opacity: item.separado ? 0.72 : 1,
              }}
            >
              {/* Indicador de separado */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: item.separado ? 'var(--clr-emerald, #10b981)' : 'var(--clr-border)',
                }}
                aria-hidden="true"
              >
                {item.separado && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>

              {/* Localização */}
              <span
                style={{
                  fontSize: '.68rem',
                  fontWeight: 700,
                  color: 'var(--clr-muted)',
                  flexShrink: 0,
                  minWidth: 44,
                  whiteSpace: 'nowrap',
                }}
              >
                <MapPin size={9} style={{ display: 'inline', marginRight: 2 }} />
                {item.localizacao}
              </span>

              {/* Código + nome */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="font-mono font-bold"
                  style={{
                    fontSize: '.82rem',
                    color: item.separado ? 'var(--clr-muted)' : 'var(--clr-primary, #818cf8)',
                  }}
                >
                  {item.codigo}
                </span>
                <div
                  style={{
                    fontSize: '.72rem',
                    color: 'var(--clr-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.nome}
                >
                  {item.nome}
                </div>
              </div>

              {/* Quantidade */}
              <span
                style={{
                  fontSize: '.72rem',
                  fontWeight: 800,
                  padding: '.15rem .4rem',
                  borderRadius: '5px',
                  background: item.separado ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.2)',
                  color: 'var(--clr-emerald, #10b981)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.quantidade.toLowerCase().includes('und') ? item.quantidade : `${item.quantidade} und`}
              </span>
            </div>
          ))}
        </div>
      )}

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
