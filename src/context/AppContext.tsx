// src/context/AppContext.tsx
// Contexto global da aplicação WMS

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';
import {
  ouvirRequisicoes,
  ouvirOperadores,
  salvarOperadorFirestore,
  removerOperadorFirestore,
} from '../firebase/firestore';
import { Operador, OPERADORES, Requisicao, ViewType } from '../types';
import { useNotificacoes } from '../hooks/useNotificacoes';
import { ModalConfirmacao, ModalConfirmacaoConfig } from '../components/ModalConfirmacao';

const STORAGE_KEY_OPERADORES = 'wms_almoxarifado_operadores';
const STORAGE_KEY_OPERADOR_ATIVO = 'wms_almoxarifado_operador_ativo';

interface AppContextType {
  operadorAtivo: Operador;
  setOperadorAtivo: (op: Operador) => void;
  operadores: Operador[];
  adicionarOperador: (nome: string, papel: 'lider' | 'separador') => void;
  editarOperador: (id: string, novoNome: string, papel?: 'lider' | 'separador') => void;
  removerOperador: (id: string) => void;
  requisicoes: Requisicao[];
  carregando: boolean;
  viewAtual: ViewType;
  setViewAtual: (v: ViewType) => void;
  requisicaoSelecionada: Requisicao | null;
  setRequisicaoSelecionada: (r: Requisicao | null) => void;
  notificacoes: ReturnType<typeof useNotificacoes>['notificacoes'];
  permissaoNotificacao: NotificationPermission;
  solicitarPermissaoNotificacao: () => Promise<NotificationPermission | undefined>;
  enviarNotificacao: ReturnType<typeof useNotificacoes>['enviarNotificacao'];
  removerNotificacao: ReturnType<typeof useNotificacoes>['removerNotificacao'];
  conectado: boolean;
  erroConexao: string | null;
  solicitarConfirmacao: (config: ModalConfirmacaoConfig) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Lista de operadores em tempo real com fallback para storage local
  const [operadores, setOperadores] = useState<Operador[]>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_OPERADORES);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Erro ao ler operadores do storage:', e);
    }
    return OPERADORES;
  });

  // Operador atualmente ativo neste dispositivo
  const [operadorAtivo, setOperadorAtivoState] = useState<Operador>(() => {
    try {
      const salvoId = localStorage.getItem(STORAGE_KEY_OPERADOR_ATIVO);
      if (salvoId) {
        const encontrado = operadores.find((o) => o.id === salvoId);
        if (encontrado) return encontrado;
      }
    } catch {}
    return operadores[0] || OPERADORES[0];
  });

  const setOperadorAtivo = (op: Operador) => {
    setOperadorAtivoState(op);
    try {
      localStorage.setItem(STORAGE_KEY_OPERADOR_ATIVO, op.id);
    } catch {}
  };

  // Funções para gerenciar operadores universais (salvos no Firestore)
  const adicionarOperador = async (nome: string, papel: 'lider' | 'separador') => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    const novoOp: Operador = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nome: nomeLimpo,
      papel,
    };
    // Salva no banco de dados Firestore
    try {
      await salvarOperadorFirestore(novoOp);
    } catch (e) {
      console.error('Erro ao salvar operador no banco:', e);
    }
    setOperadores((prev) => [...prev.filter((o) => o.id !== novoOp.id), novoOp]);
  };

  const editarOperador = async (id: string, novoNome: string, papel?: 'lider' | 'separador') => {
    const nomeLimpo = novoNome.trim();
    if (!nomeLimpo) return;
    
    const opAtual = operadores.find((o) => o.id === id);
    const atualizado: Operador = {
      id,
      nome: nomeLimpo,
      papel: papel !== undefined ? papel : (opAtual?.papel || 'separador'),
    };

    // Atualiza no banco de dados Firestore imediatamente
    try {
      await salvarOperadorFirestore(atualizado);
    } catch (e) {
      console.error('Erro ao atualizar operador no banco:', e);
    }

    setOperadores((prev) =>
      prev.map((op) => (op.id === id ? atualizado : op))
    );

    if (operadorAtivo.id === id) {
      setOperadorAtivoState(atualizado);
    }
  };

  const removerOperador = async (id: string) => {
    try {
      await removerOperadorFirestore(id);
    } catch (e) {
      console.error('Erro ao remover operador no banco:', e);
    }
    setOperadores((prev) => {
      const filtrados = prev.filter((o) => o.id !== id);
      if (filtrados.length === 0) return prev;
      if (operadorAtivo.id === id) {
        setOperadorAtivo(filtrados[0]);
      }
      return filtrados;
    });
  };

  // Modal de confirmação do sistema
  const [modalConfig, setModalConfig] = useState<ModalConfirmacaoConfig | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const solicitarConfirmacao = (config: ModalConfirmacaoConfig) => {
    setModalConfig(config);
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setModalConfig(null);
  };

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [viewAtual, setViewAtual] = useState<ViewType>('painel');
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null);
  const [conectado, setConectado] = useState(false);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const prevReqRef = useRef<Requisicao[]>([]);

  const {
    notificacoes,
    permissao: permissaoNotificacao,
    solicitarPermissao: solicitarPermissaoNotificacao,
    enviarNotificacao,
    removerNotificacao,
  } = useNotificacoes();

  // Autenticação anônima ao iniciar (opcional)
  useEffect(() => {
    signInAnonymously(auth)
      .then(() => {
        setConectado(true);
        setErroConexao(null);
      })
      .catch((err: any) => {
        console.warn('Aviso de autenticação Firebase:', err?.message || err);
        if (err?.code === 'auth/configuration-not-found') {
          console.info('ℹ️ Dica: Ative o provedor "Anônimo" em Firebase Console -> Authentication -> Sign-in method.');
        }
        setConectado(true);
        setErroConexao(null);
      });
  }, []);

  // Ouve mudanças no Firestore em tempo real
  useEffect(() => {
    if (!conectado) return;

    const unsubscribe = ouvirRequisicoes((novas) => {
      const prev = prevReqRef.current;
      novas.forEach((nova) => {
        const antiga = prev.find((r) => r.id === nova.id);
        if (antiga && antiga.status !== nova.status) {
          const msgs: Record<string, string> = {
            EM_SEPARACAO: `📦 ${nova.separador_nome} assumiu ${nova.numero_nota}`,
            PAUSADO: `⏸️ ${nova.numero_nota} foi pausada - ${nova.motivo_pausa}`,
            AGUARDANDO_RETIRADA: `✅ ${nova.numero_nota} pronta para retirada!`,
            ENTREGUE: `🚚 ${nova.numero_nota} foi entregue ao cliente.`,
          };
          const msg = msgs[nova.status];
          if (msg) {
            enviarNotificacao(
              `Status: ${nova.status.replace(/_/g, ' ')}`,
              msg,
              nova.status === 'AGUARDANDO_RETIRADA' ? 'aviso' : 'info'
            );
          }
        }
      });
      prevReqRef.current = novas;

      setRequisicoes(novas);
      setCarregando(false);
    });

    return unsubscribe;
  }, [conectado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ouve mudanças nos operadores em tempo real para sincronizar com todos os aparelhos
  useEffect(() => {
    if (!conectado) return;

    const unsubscribe = ouvirOperadores((opsBanco) => {
      if (opsBanco && opsBanco.length > 0) {
        setOperadores(opsBanco);
        try {
          localStorage.setItem(STORAGE_KEY_OPERADORES, JSON.stringify(opsBanco));
        } catch {}

        // Atualiza operador ativo se o nome ou papel dele tiver mudado no banco
        setOperadorAtivoState((atual) => {
          const correspondente = opsBanco.find((o) => o.id === atual.id);
          return correspondente || atual;
        });
      }
    });

    return unsubscribe;
  }, [conectado]);

  // Atualiza a requisição selecionada quando ela muda no Firestore
  useEffect(() => {
    if (requisicaoSelecionada) {
      const atualizada = requisicoes.find((r) => r.id === requisicaoSelecionada.id);
      if (atualizada) setRequisicaoSelecionada(atualizada);
    }
  }, [requisicoes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider
      value={{
        operadorAtivo,
        setOperadorAtivo,
        operadores,
        adicionarOperador,
        editarOperador,
        removerOperador,
        requisicoes,
        carregando,
        viewAtual,
        setViewAtual,
        requisicaoSelecionada,
        setRequisicaoSelecionada,
        notificacoes,
        permissaoNotificacao,
        solicitarPermissaoNotificacao,
        enviarNotificacao,
        removerNotificacao,
        conectado,
        erroConexao,
        solicitarConfirmacao,
      }}
    >
      {children}
      <ModalConfirmacao
        aberto={modalAberto}
        config={modalConfig}
        aoFechar={fecharModal}
      />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}
