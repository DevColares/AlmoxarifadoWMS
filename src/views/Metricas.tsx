// src/views/Metricas.tsx
// Painel de métricas e desempenho detalhado de cada separador

import React, { useState, useEffect } from 'react';
import {
  BarChart3, Clock, CheckCircle2, Truck, TrendingUp,
  Search, User, RefreshCw, Star, Zap, ArrowDownRight, ArrowUpRight, Award, Flame
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buscarHistorico } from '../firebase/firestore';
import { Requisicao } from '../types';

function formatarTempo(segundos: number): string {
  if (isNaN(segundos) || segundos < 0) return '00:00';
  const h = Math.floor(segundos / 3600);
  const mm = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0');
  const ss = (segundos % 60).toString().padStart(2, '0');
  if (h > 0) {
    return `${h}h ${mm}m ${ss}s`;
  }
  return `${mm}:${ss}`;
}

function formatarData(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '-';
  }
}

interface EstatisticaSeparador {
  id: string;
  nome: string;
  totalConcluidas: number;
  totalItensSeparados: number;
  tempoMedio: number;
  tempoMinimo: number; // mais rápido (tempo curto)
  tempoMaximo: number; // mais demorado (tempo longo)
  tempoTotal: number;
  ultimasOrdens: Requisicao[];
}

export function Metricas() {
  const { requisicoes } = useApp();
  const [historico, setHistorico] = useState<Requisicao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroSeparador, setFiltroSeparador] = useState<string>('TODOS');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const carregarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      const h = await buscarHistorico();
      setHistorico(h);
    } catch (err) {
      console.warn('Erro ao carregar histórico:', err);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  useEffect(() => { carregarHistorico(); }, []);

  // Consideramos todas as ordens que já foram separadas:
  // 1. Ordens do histórico (ENTREGUE)
  // 2. Ordens ativas no estado (AGUARDANDO_RETIRADA ou ENTREGUE)
  const mapUnicas = new Map<string, Requisicao>();
  
  // Adiciona do histórico
  historico.forEach((r) => mapUnicas.set(r.id, r));
  // Adiciona ativas que já concluíram separação
  requisicoes
    .filter((r) => r.status === 'AGUARDANDO_RETIRADA' || r.status === 'ENTREGUE')
    .forEach((r) => mapUnicas.set(r.id, r));

  const ordensFinalizadas = Array.from(mapUnicas.values());

  // Estatísticas em tempo real
  const emSeparacao = requisicoes.filter((r) => r.status === 'EM_SEPARACAO').length;
  const aguardando = requisicoes.filter((r) => r.status === 'AGUARDANDO_RETIRADA').length;
  const entreguesTotais = ordensFinalizadas.length;

  const tempoMedioGeral = entreguesTotais > 0
    ? ordensFinalizadas.reduce((acc, r) => acc + (r.tempo_segundos || 0), 0) / entreguesTotais
    : 0;

  // Estatísticas por separador com tempo Médio, Curto (Mínimo) e Longo (Máximo)
  const separadoresMap: Record<string, EstatisticaSeparador> = {};

  ordensFinalizadas.forEach((r) => {
    if (!r.separador_nome) return;
    const chave = r.separador_id || r.separador_nome;
    const t = r.tempo_segundos || 0;
    const itensCount = r.itens ? r.itens.filter((i) => i.separado).length : 0;

    if (!separadoresMap[chave]) {
      separadoresMap[chave] = {
        id: chave,
        nome: r.separador_nome,
        totalConcluidas: 0,
        totalItensSeparados: 0,
        tempoMedio: 0,
        tempoMinimo: t,
        tempoMaximo: t,
        tempoTotal: 0,
        ultimasOrdens: [],
      };
    }

    const sep = separadoresMap[chave];
    sep.totalConcluidas++;
    sep.totalItensSeparados += itensCount;
    sep.tempoTotal += t;

    // Tempo mais curto (menor) e mais longo (maior)
    if (t < sep.tempoMinimo || sep.totalConcluidas === 1) {
      sep.tempoMinimo = t;
    }
    if (t > sep.tempoMaximo) {
      sep.tempoMaximo = t;
    }

    sep.ultimasOrdens.push(r);
  });

  // Calcula a média para cada separador e ordena pelo volume de entregas
  const separadoresList: EstatisticaSeparador[] = Object.values(separadoresMap).map((s) => ({
    ...s,
    tempoMedio: s.totalConcluidas > 0 ? Math.round(s.tempoTotal / s.totalConcluidas) : 0,
  })).sort((a, b) => b.totalConcluidas - a.totalConcluidas);

  // Lista de nomes únicos para filtro
  const nomesSeparadores = Array.from(new Set(separadoresList.map((s) => s.nome)));

  // Histórico filtrado para a tabela
  const historicoFiltrado = ordensFinalizadas.filter((r) => {
    const atendeFiltroNome =
      filtroSeparador === 'TODOS' || r.separador_nome === filtroSeparador;
    if (!atendeFiltroNome) return false;

    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      (r.numero_nota || '').toLowerCase().includes(termo) ||
      (r.separador_nome || '').toLowerCase().includes(termo) ||
      (r.solicitante || '').toLowerCase().includes(termo)
    );
  });

  return (
    <main className="main-content">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-bold" style={{ fontSize: '1.3rem' }}>Métricas & Desempenho</h1>
          <p className="text-sm text-muted">Estatísticas detalhadas de separação com tempos médios, mais rápidos e mais longos</p>
        </div>
        <button
          id="btn-atualizar-metricas"
          className="btn btn-ghost btn-sm"
          onClick={carregarHistorico}
          disabled={carregandoHistorico}
          title="Recarregar métricas do banco de dados"
          aria-label="Atualizar histórico"
        >
          <RefreshCw size={14} className={carregandoHistorico ? 'spin-icon' : ''} />
          <span className="hidden-mobile">Atualizar</span>
        </button>
      </div>

      {/* Cards de Resumo Geral */}
      <div className="metricas-grid mb-6">
        <div className="metrica-card verde">
          <div className="metrica-valor text-emerald">{entreguesTotais}</div>
          <div className="metrica-label">
            <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '.3rem' }} />
            Separações Finalizadas
          </div>
        </div>

        <div className="metrica-card amber">
          <div className="metrica-valor text-amber" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatarTempo(Math.round(tempoMedioGeral))}
          </div>
          <div className="metrica-label">
            <Clock size={12} style={{ display: 'inline', marginRight: '.3rem' }} />
            Tempo Médio Geral
          </div>
        </div>

        <div className="metrica-card indigo">
          <div className="metrica-valor text-indigo">{emSeparacao}</div>
          <div className="metrica-label">
            <TrendingUp size={12} style={{ display: 'inline', marginRight: '.3rem' }} />
            Em Separação Agora
          </div>
        </div>

        <div className="metrica-card sky">
          <div className="metrica-valor text-sky">{aguardando}</div>
          <div className="metrica-label">
            <Truck size={12} style={{ display: 'inline', marginRight: '.3rem' }} />
            Aguardando Retirada
          </div>
        </div>
      </div>

      {/* SEÇÃO: ESTATÍSTICAS DE CADA SEPARADOR (TEMPO MÉDIO, CURTO E LONGO) */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="section-title" style={{ margin: 0 }}>
            <Award size={16} className="text-amber" /> Desempenho Individual dos Separadores
          </div>
          <span className="text-xs text-muted">
            {separadoresList.length} operador(es) com histórico registrado
          </span>
        </div>

        {separadoresList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--clr-muted)' }}>
            <Clock size={32} style={{ margin: '0 auto .5rem', opacity: 0.4 }} />
            <p className="font-semibold">Nenhuma separação computada ainda.</p>
            <p className="text-xs">Conclua a separação de pedidos no checklist para visualizar os tempos individuais.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {separadoresList.map((sep, idx) => {
              const medalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              return (
                <div
                  key={sep.id}
                  style={{
                    background: idx === 0 ? 'var(--clr-surface2)' : 'var(--clr-bg)',
                    border: `1px solid ${idx === 0 ? 'var(--clr-amber)' : 'var(--clr-border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.75rem',
                    position: 'relative',
                  }}
                >
                  {/* Cabeçalho do operador */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--clr-surface3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '.85rem',
                          color: 'var(--clr-emerald)',
                        }}
                      >
                        {medalha || <User size={15} />}
                      </div>
                      <div>
                        <div className="font-bold text-sm flex items-center gap-1">
                          {sep.nome}
                        </div>
                        <div className="text-xs text-muted">
                          {sep.totalConcluidas} {sep.totalConcluidas === 1 ? 'pedido separado' : 'pedidos separados'}
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-emerald font-mono text-xs">
                      {sep.totalItensSeparados} itens
                    </span>
                  </div>

                  {/* Grid com Tempos: Médio, Curto (Mínimo) e Longo (Máximo) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '.5rem',
                      background: 'var(--clr-surface)',
                      padding: '.6rem',
                      borderRadius: 'var(--radius-sm)',
                      textAlign: 'center',
                    }}
                  >
                    {/* Tempo Médio */}
                    <div style={{ borderRight: '1px solid var(--clr-border)' }}>
                      <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <Clock size={10} /> Médio
                      </div>
                      <div className="font-mono font-bold text-amber" style={{ fontSize: '.95rem', marginTop: '2px' }}>
                        {formatarTempo(sep.tempoMedio)}
                      </div>
                    </div>

                    {/* Mais Rápido (Tempo Curto) */}
                    <div style={{ borderRight: '1px solid var(--clr-border)' }}>
                      <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <ArrowDownRight size={10} className="text-emerald" /> Mais Rápido
                      </div>
                      <div className="font-mono font-bold text-emerald" style={{ fontSize: '.95rem', marginTop: '2px' }}>
                        {formatarTempo(sep.tempoMinimo)}
                      </div>
                    </div>

                    {/* Mais Longo (Tempo Longo) */}
                    <div>
                      <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <ArrowUpRight size={10} className="text-rose" /> Mais Longo
                      </div>
                      <div className="font-mono font-bold text-rose" style={{ fontSize: '.95rem', marginTop: '2px' }}>
                        {formatarTempo(sep.tempoMaximo)}
                      </div>
                    </div>
                  </div>

                  {/* Detalhe de produtividade */}
                  <div className="flex items-center justify-between text-xs text-muted" style={{ paddingTop: '.25rem' }}>
                    <span>Tempo total em picking:</span>
                    <span className="font-mono font-semibold">{formatarTempo(sep.tempoTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico detalhado com Filtros */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="section-title" style={{ margin: 0 }}>
            <BarChart3 size={14} /> Histórico de Pedidos Separados
          </div>
          {/* Seletor de filtro por operador */}
          {nomesSeparadores.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Filtrar por separador:</span>
              <select
                id="select-filtro-separador"
                className="form-input text-xs"
                style={{ padding: '.25rem .5rem', width: 'auto' }}
                value={filtroSeparador}
                onChange={(e) => setFiltroSeparador(e.target.value)}
              >
                <option value="TODOS">Todos os operadores</option>
                {nomesSeparadores.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Campo de pesquisa */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={15} style={{
            position: 'absolute', left: '.75rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--clr-muted)', pointerEvents: 'none'
          }} />
          <input
            id="input-busca-historico"
            type="search"
            className="form-input"
            placeholder="Buscar por nota, operador ou solicitante…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
            aria-label="Buscar no histórico"
          />
        </div>

        {carregandoHistorico ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" aria-label="Carregando histórico" />
          </div>
        ) : historicoFiltrado.length === 0 ? (
          <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
            {busca || filtroSeparador !== 'TODOS' ? 'Nenhum resultado para os filtros atuais.' : 'Nenhuma separação registrada ainda.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--clr-border)' }}>
                  {['Nota', 'Solicitante', 'Separador', 'Tempo Gasto', 'Status', 'Data/Hora'].map((col) => (
                    <th key={col} style={{
                      textAlign: 'left', padding: '.5rem .75rem',
                      color: 'var(--clr-muted)', fontWeight: 600,
                      fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em'
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historicoFiltrado.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: '1px solid var(--clr-border)', transition: 'background var(--dur-fast)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clr-surface2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '.6rem .75rem', fontWeight: 700, color: 'var(--clr-emerald)' }}>
                      {r.numero_nota}
                    </td>
                    <td style={{ padding: '.6rem .75rem', color: 'var(--clr-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.solicitante}
                    </td>
                    <td style={{ padding: '.6rem .75rem' }}>
                      <span className="flex items-center gap-1 font-semibold">
                        <User size={12} style={{ opacity: .7 }} />
                        {r.separador_nome ?? '-'}
                      </span>
                    </td>
                    <td style={{ padding: '.6rem .75rem', fontFamily: 'var(--font-mono)', color: 'var(--clr-amber)', fontWeight: 600 }}>
                      {formatarTempo(r.tempo_segundos || 0)}
                    </td>
                    <td style={{ padding: '.6rem .75rem' }}>
                      <span className={`badge-status ${r.status}`} style={{ fontSize: '.7rem', padding: '.2rem .5rem' }}>
                        {r.status === 'AGUARDANDO_RETIRADA' ? 'Pronto p/ Retirada' : r.status === 'ENTREGUE' ? 'Entregue' : r.status}
                      </span>
                    </td>
                    <td style={{ padding: '.6rem .75rem', color: 'var(--clr-muted)', whiteSpace: 'nowrap' }}>
                      {formatarData(r.data_entrega || r.data_conclusao_separacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .spin-icon { animation: spin .8s linear infinite; }
        @media (max-width: 600px) {
          .hidden-mobile { display: none; }
        }
      `}</style>
    </main>
  );
}
