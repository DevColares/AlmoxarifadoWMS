// src/views/PainelGeral.tsx
// Painel principal com todas as requisições em tempo real

import React, { useState } from 'react';
import { Package, Search, Filter } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CardRequisicao } from '../components/CardRequisicao';
import { StatusRequisicao } from '../types';

const FILTROS: { label: string; valor: StatusRequisicao | 'TODOS' }[] = [
  { label: 'Todos', valor: 'TODOS' },
  { label: 'Pendentes', valor: 'PENDENTE' },
  { label: 'Em Separação', valor: 'EM_SEPARACAO' },
  { label: 'Pausados', valor: 'PAUSADO' },
  { label: 'Aguard. Retirada', valor: 'AGUARDANDO_RETIRADA' },
  { label: 'Entregues', valor: 'ENTREGUE' },
];

export function PainelGeral() {
  const { requisicoes, carregando } = useApp();
  const [filtroStatus, setFiltroStatus] = useState<StatusRequisicao | 'TODOS'>('TODOS');
  const [busca, setBusca] = useState('');

  const filtradas = requisicoes.filter((r) => {
    const okStatus = filtroStatus === 'TODOS' || r.status === filtroStatus;
    const okBusca =
      !busca ||
      r.numero_nota.toLowerCase().includes(busca.toLowerCase()) ||
      r.solicitante.toLowerCase().includes(busca.toLowerCase()) ||
      (r.separador_nome ?? '').toLowerCase().includes(busca.toLowerCase());
    return okStatus && okBusca;
  });

  // Ordenação: AGUARDANDO_RETIRADA > EM_SEPARACAO > PAUSADO > PENDENTE > ENTREGUE
  const ORDEM: Record<string, number> = {
    AGUARDANDO_RETIRADA: 0,
    EM_SEPARACAO: 1,
    PAUSADO: 2,
    PENDENTE: 3,
    ENTREGUE: 4,
  };
  const ordenadas = [...filtradas].sort(
    (a, b) => (ORDEM[a.status] ?? 9) - (ORDEM[b.status] ?? 9)
  );

  if (carregando) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-label="Carregando requisições" />
        <p style={{ color: 'var(--clr-muted)' }}>Conectando ao Firestore…</p>
      </div>
    );
  }

  return (
    <main className="main-content">
      {/* Título e filtros */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 className="font-bold" style={{ fontSize: '1.4rem', marginBottom: '.25rem' }}>
          Painel de Separação
        </h1>
        <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
          {requisicoes.filter((r) => r.status !== 'ENTREGUE').length} requisições ativas
          {requisicoes.filter((r) => r.status === 'AGUARDANDO_RETIRADA').length > 0 && (
            <span className="text-amber" style={{ marginLeft: '.5rem', fontWeight: 700 }}>
              ⚡ {requisicoes.filter((r) => r.status === 'AGUARDANDO_RETIRADA').length} aguardando retirada!
            </span>
          )}
        </p>

        {/* Barra de busca */}
        <div style={{ position: 'relative', marginBottom: '.75rem' }}>
          <Search
            size={16}
            style={{
              position: 'absolute', left: '.75rem', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--clr-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            id="input-busca-painel"
            type="search"
            className="form-input"
            placeholder="Buscar por nota, solicitante ou separador…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
            aria-label="Buscar requisições"
          />
        </div>

        {/* Filtros por status */}
        <div style={{ display: 'flex', gap: '.5rem', overflowX: 'auto', paddingBottom: '.25rem', scrollbarWidth: 'none' }}>
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              id={`btn-filtro-${f.valor.toLowerCase()}`}
              className={`btn btn-sm ${filtroStatus === f.valor ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroStatus(f.valor)}
              aria-pressed={filtroStatus === f.valor}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grade de cards */}
      {ordenadas.length === 0 ? (
        <div className="empty-state" role="status">
          <div className="empty-state-icon">
            <Package size={72} />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Nenhuma requisição encontrada</h2>
          <p style={{ fontSize: '.875rem' }}>
            {busca || filtroStatus !== 'TODOS'
              ? 'Tente ajustar os filtros de busca.'
              : 'Crie uma nova requisição para começar.'}
          </p>
        </div>
      ) : (
        <div className="grid-requisicoes">
          {ordenadas.map((req) => (
            <CardRequisicao key={req.id} req={req} />
          ))}
        </div>
      )}
    </main>
  );
}
