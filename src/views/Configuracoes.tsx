// src/views/Configuracoes.tsx
// Tela de gerenciamento de usuários, cadastro de separadores e edição do nome do Líder

import React, { useState } from 'react';
import {
  Users, UserPlus, Shield, User, Edit3, Trash2, Check, X, Star, Settings, Database, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Operador } from '../types';
import { limparBancoDados } from '../firebase/firestore';

export function Configuracoes() {
  const {
    operadores,
    operadorAtivo,
    setOperadorAtivo,
    adicionarOperador,
    editarOperador,
    removerOperador,
    solicitarConfirmacao,
    enviarNotificacao,
  } = useApp();

  // Estados do formulário de novo operador
  const [novoNome, setNovoNome] = useState('');
  const [novoPapel, setNovoPapel] = useState<'lider' | 'separador'>('separador');

  // Estado de edição de operador
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [papelEditado, setPapelEditado] = useState<'lider' | 'separador'>('separador');

  const handleCadastrar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) {
      enviarNotificacao('Atenção', 'Informe o nome do operador.', 'aviso');
      return;
    }

    adicionarOperador(novoNome, novoPapel);
    enviarNotificacao('Sucesso', `Operador "${novoNome.trim()}" cadastrado!`, 'sucesso');
    setNovoNome('');
    setNovoPapel('separador');
  };

  const iniciarEdicao = (op: Operador) => {
    setEditandoId(op.id);
    setNomeEditado(op.nome);
    setPapelEditado(op.papel);
  };

  const salvarEdicao = (id: string) => {
    if (!nomeEditado.trim()) {
      enviarNotificacao('Atenção', 'O nome não pode ficar em branco.', 'aviso');
      return;
    }
    editarOperador(id, nomeEditado, papelEditado);
    enviarNotificacao('Atualizado', 'Dados do operador alterados com sucesso.', 'sucesso');
    setEditandoId(null);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setNomeEditado('');
  };

  const handleExcluir = (op: Operador) => {
    if (operadores.length <= 1) {
      solicitarConfirmacao({
        titulo: 'Operação não permitida',
        mensagem: 'É necessário ter pelo menos um operador cadastrado no sistema.',
        tipo: 'aviso',
        textoConfirmar: 'Entendido',
        textoCancelar: '',
        onConfirmar: () => {},
      });
      return;
    }

    solicitarConfirmacao({
      titulo: 'Excluir Operador',
      mensagem: `Tem certeza que deseja remover "${op.nome}" da equipe?`,
      tipo: 'perigo',
      textoConfirmar: 'Sim, Excluir',
      textoCancelar: 'Cancelar',
      onConfirmar: () => {
        removerOperador(op.id);
        enviarNotificacao('Removido', `Operador "${op.nome}" foi removido.`, 'info');
      },
    });
  };

  const [limpandoBanco, setLimpandoBanco] = useState(false);

  const handleLimparBanco = (apenasRequisicoes: boolean) => {
    solicitarConfirmacao({
      titulo: apenasRequisicoes ? 'Limpar Pedidos e Histórico' : 'Zerar Banco de Dados Completo',
      mensagem: apenasRequisicoes
        ? 'Atenção: Todas as requisições em andamento e todo o histórico serão excluídos permanentemente. Os operadores cadastrados serão mantidos. Deseja continuar?'
        : 'PERIGO: Todas as requisições, métricas e operadores serão excluídos e resetados para o padrão de fábrica. Deseja realmente prosseguir?',
      tipo: 'perigo',
      textoConfirmar: 'Sim, Excluir Tudo',
      textoCancelar: 'Cancelar',
      onConfirmar: async () => {
        try {
          setLimpandoBanco(true);
          await limparBancoDados(!apenasRequisicoes);
          enviarNotificacao(
            'Banco Limpo',
            apenasRequisicoes
              ? 'Todas as requisições foram removidas com sucesso.'
              : 'O banco de dados foi resetado para os valores padrão.',
            'sucesso'
          );
        } catch (err: any) {
          console.error(err);
          enviarNotificacao('Erro', 'Não foi possível limpar o banco: ' + (err?.message || err), 'erro');
        } finally {
          setLimpandoBanco(false);
        }
      },
    });
  };

  // Separa o líder principal e os demais separadores
  const lideres = operadores.filter((o) => o.papel === 'lider');
  const separadores = operadores.filter((o) => o.papel === 'separador');

  return (
    <main className="main-content">
      {/* Cabeçalho */}
      <div className="mb-5">
        <h1 className="font-bold flex items-center gap-2" style={{ fontSize: '1.35rem' }}>
          <Settings size={22} className="text-emerald" /> Configurações & Gestão de Usuários
        </h1>
        <p className="text-sm text-muted">
          Cadastre novos separadores, gerencie operadores e altere o nome do Líder do Almoxarifado
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Formulário de Cadastro de Novo Usuário */}
        <div className="card">
          <div className="section-title mb-3">
            <UserPlus size={16} className="text-emerald" /> Cadastrar Novo Usuário
          </div>
          <form onSubmit={handleCadastrar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Nome Completo:</label>
              <input
                id="input-novo-usuario-nome"
                type="text"
                className="form-input"
                placeholder="Ex: João Silva"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Função / Papel:</label>
              <select
                id="select-novo-usuario-papel"
                className="form-select"
                value={novoPapel}
                onChange={(e) => setNovoPapel(e.target.value as 'lider' | 'separador')}
              >
                <option value="separador">👤 Separador de Materiais</option>
                <option value="lider">👑 Líder de Almoxarifado</option>
              </select>
            </div>

            <button
              id="btn-cadastrar-usuario"
              type="submit"
              className="btn btn-primary"
              style={{ justifyContent: 'center', marginTop: '.5rem' }}
            >
              <UserPlus size={15} /> Cadastrar na Equipe
            </button>
          </form>
        </div>

        {/* Informações da Sessão Atual */}
        <div className="card" style={{ background: 'var(--clr-surface2)', border: '1px solid var(--clr-border)' }}>
          <div className="section-title mb-2">
            <Shield size={16} className="text-amber" /> Operador Selecionado Agora
          </div>
          <p className="text-xs text-muted mb-4">
            Este é o operador que está assinando as separações e retiradas neste dispositivo.
          </p>

          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius)',
              background: 'var(--clr-bg)',
              border: '1px solid var(--clr-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: operadorAtivo.papel === 'lider' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: operadorAtivo.papel === 'lider' ? 'var(--clr-amber)' : 'var(--clr-emerald)',
                }}
              >
                {operadorAtivo.papel === 'lider' ? <Star size={18} /> : <User size={18} />}
              </div>
              <div>
                <div className="font-bold text-sm">{operadorAtivo.nome}</div>
                <div className="text-xs text-muted">
                  {operadorAtivo.papel === 'lider' ? '👑 Líder Almoxarifado' : '👤 Separador'}
                </div>
              </div>
            </div>
            <span className="badge badge-emerald text-xs">Ativo</span>
          </div>

          <div className="text-xs text-muted">
            💡 Dica: Você pode trocar o operador ativo a qualquer momento no seletor do topo da tela.
          </div>
        </div>
      </div>

      {/* Lista de Usuários e Edição (Líderes e Separadores) */}
      <div className="card mt-6">
        <div className="section-title mb-3">
          <Users size={16} /> Equipe Cadastrada ({operadores.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
          {operadores.map((op) => {
            const estaEditando = editandoId === op.id;
            const isLider = op.papel === 'lider';
            const isAtivo = operadorAtivo.id === op.id;

            return (
              <div
                key={op.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '.85rem 1rem',
                  borderRadius: 'var(--radius)',
                  background: isAtivo ? 'var(--clr-surface2)' : 'var(--clr-bg)',
                  border: `1px solid ${isAtivo ? 'var(--clr-emerald)' : 'var(--clr-border)'}`,
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                {estaEditando ? (
                  /* Modo de Edição */
                  <div style={{ display: 'flex', gap: '.65rem', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      className="form-input text-sm"
                      value={nomeEditado}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      placeholder="Nome do operador"
                      style={{ flex: '1 1 200px' }}
                      autoFocus
                    />
                    <select
                      className="form-select text-sm"
                      value={papelEditado}
                      onChange={(e) => setPapelEditado(e.target.value as 'lider' | 'separador')}
                      style={{ width: 'auto' }}
                    >
                      <option value="separador">Separador</option>
                      <option value="lider">Líder</option>
                    </select>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => salvarEdicao(op.id)}
                        title="Salvar alterações"
                      >
                        <Check size={14} /> Salvar
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={cancelarEdicao}
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Modo de Visualização Normal */
                  <>
                    <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '1.1rem' }}>{isLider ? '👑' : '👤'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span className="truncate">{op.nome}</span>
                          {isAtivo && (
                            <span className="badge badge-emerald" style={{ fontSize: '.65rem', padding: '.15rem .45rem' }}>
                              Você
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">
                          {isLider ? 'Líder de Almoxarifado' : 'Separador de Pedidos'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => iniciarEdicao(op)}
                        title={`Editar ${isLider ? 'nome do líder' : 'operador'}`}
                      >
                        <Edit3 size={14} />
                        <span className="text-xs">{isLider ? 'Editar Nome' : 'Editar'}</span>
                      </button>

                      <button
                        className="btn btn-ghost btn-sm text-rose"
                        onClick={() => handleExcluir(op)}
                        disabled={operadores.length <= 1}
                        title="Remover operador"
                        style={{ opacity: operadores.length <= 1 ? 0.3 : 1 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Zona de Manutenção / Limpeza do Banco de Dados */}
      <div
        className="card mt-4"
        style={{
          border: '1px solid rgba(244, 63, 94, 0.3)',
          background: 'rgba(244, 63, 94, 0.02)',
        }}
      >
        <div className="section-title mb-2 text-rose flex items-center gap-2 font-bold">
          <AlertTriangle size={18} /> Zona de Manutenção do Banco de Dados
        </div>
        <p className="text-sm text-muted mb-4">
          Utilize essas ações para limpar dados de teste ou reiniciar o sistema. Os dados são removidos do Firebase em tempo real para todos os dispositivos.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            id="btn-limpar-requisicoes"
            type="button"
            className="btn btn-ghost text-rose"
            style={{
              border: '1px solid rgba(244, 63, 94, 0.4)',
              background: 'rgba(244, 63, 94, 0.08)',
            }}
            onClick={() => handleLimparBanco(true)}
            disabled={limpandoBanco}
          >
            {limpandoBanco ? <RefreshCw size={15} className="spin" /> : <Trash2 size={15} />}
            <span>Limpar Pedidos e Histórico</span>
          </button>

          <button
            id="btn-zerar-banco"
            type="button"
            className="btn btn-ghost"
            style={{
              border: '1px solid rgba(245, 158, 11, 0.4)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: 'var(--clr-amber)',
            }}
            onClick={() => handleLimparBanco(false)}
            disabled={limpandoBanco}
          >
            {limpandoBanco ? <RefreshCw size={15} className="spin" /> : <Database size={15} />}
            <span>Zerar Banco Completo (Pedidos + Equipe)</span>
          </button>
        </div>
      </div>
    </main>
  );
}
