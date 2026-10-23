// src/components/Header.tsx
// Cabeçalho com seletor de operador e status de conexão

import React from 'react';
import { Warehouse, Bell, BellOff, Wifi, WifiOff, Star, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Header() {
  const {
    operadorAtivo,
    setOperadorAtivo,
    operadores,
    conectado,
    permissaoNotificacao,
    solicitarPermissaoNotificacao,
    viewAtual,
    setViewAtual,
  } = useApp();

  return (
    <header className="header" role="banner">
      {/* Logo + Marca */}
      <div className="header-brand">
        <div className="header-logo" aria-hidden="true">
          <Warehouse size={20} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <div className="header-title">WMS</div>
          <span className="header-subtitle">Separação de Materiais</span>
        </div>
      </div>

      {/* Ações do cabeçalho */}
      <div className="header-actions">
        {/* Status de conexão */}
        <div className="header-status" aria-label={conectado ? 'Conectado ao Firebase' : 'Desconectado'}>
          {conectado
            ? <><Wifi size={13} className="text-emerald" /><span style={{ display: 'none' }}>Online</span></>
            : <><WifiOff size={13} className="text-rose" /><span style={{ display: 'none' }}>Offline</span></>
          }
          <span className={`status-dot ${conectado ? 'conectado' : ''}`} />
        </div>

        {/* Botão de notificações nativas */}
        <button
          id="btn-solicitar-notificacao"
          className={`btn-notif ${permissaoNotificacao === 'granted' ? 'ativo' : ''}`}
          onClick={solicitarPermissaoNotificacao}
          title={permissaoNotificacao === 'granted' ? 'Notificações ativas' : 'Ativar notificações do sistema'}
          aria-label="Gerenciar notificações"
        >
          {permissaoNotificacao === 'granted'
            ? <><Bell size={14} /><span className="nav-tab-text">Notif. Ativas</span></>
            : <><BellOff size={14} /><span className="nav-tab-text">Ativar</span></>
          }
        </button>

        {/* Seletor de operador */}
        <select
          id="select-operador"
          className="select-operador"
          value={operadorAtivo.id}
          onChange={(e) => {
            const op = operadores.find((o) => o.id === e.target.value);
            if (op) setOperadorAtivo(op);
          }}
          aria-label="Selecionar operador ativo"
        >
          {operadores.map((op) => (
            <option key={op.id} value={op.id}>
              {op.papel === 'lider' ? '👑 ' : '👤 '}{op.nome}
            </option>
          ))}
        </select>

        {/* Botão de Configurações / Gestão de Usuários */}
        <button
          id="btn-configuracoes-header"
          className={`btn btn-ghost btn-sm ${viewAtual === 'configuracoes' ? 'btn-primary' : ''}`}
          onClick={() => setViewAtual('configuracoes')}
          title="Configurações e Gestão de Usuários"
          aria-label="Configurações"
          style={{ padding: '.45rem' }}
        >
          <Settings size={15} />
        </button>

        {/* Badge do papel */}
        {operadorAtivo.papel === 'lider' && (
          <span className="badge-lider" aria-label="Líder de Almoxarifado">
            <Star size={10} /> Líder
          </span>
        )}
      </div>
    </header>
  );
}
