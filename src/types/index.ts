// src/types/index.ts
// Tipos centrais do sistema WMS

export type StatusRequisicao =
  | 'PENDENTE'
  | 'EM_SEPARACAO'
  | 'PAUSADO'
  | 'AGUARDANDO_RETIRADA'
  | 'ENTREGUE';

export interface ItemRequisicao {
  codigo: string;
  nome: string;
  localizacao: string;
  quantidade: string;
  separado: boolean;
}

export interface Requisicao {
  id: string;
  numero_nota: string;
  solicitante: string;
  status: StatusRequisicao;
  criado_por: string;
  data_criacao: string;
  separador_id: string | null;
  separador_nome: string | null;
  tempo_segundos: number;
  data_inicio: string | null;
  data_conclusao_separacao: string | null;
  data_entrega: string | null;
  motivo_pausa: string | null;
  itens: ItemRequisicao[];
}

export interface Operador {
  id: string;
  nome: string;
  papel: 'lider' | 'separador';
}

export const OPERADORES: Operador[] = [
  { id: 'usr_carlos', nome: 'Carlos Eduardo', papel: 'lider' },
  { id: 'usr_andelison', nome: 'Andelison Colares', papel: 'separador' },
  { id: 'usr_lucas', nome: 'Lucas Silva', papel: 'separador' },
];

export type ViewType = 'painel' | 'checklist' | 'criar' | 'metricas' | 'configuracoes';

export interface NotificacaoWMS {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'info' | 'sucesso' | 'aviso' | 'erro';
  timestamp: number;
}
