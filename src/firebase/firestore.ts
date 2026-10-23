// src/firebase/firestore.ts
// Funções de acesso ao Firestore para o WMS

import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './config';
import { Requisicao, StatusRequisicao, ItemRequisicao, Operador, OPERADORES } from '../types';

const COLECAO = 'requisicoes';
const COLECAO_OPERADORES = 'operadores';

// Ouve lista de operadores em tempo real para sincronizar entre todos os dispositivos
export function ouvirOperadores(
  callback: (operadores: Operador[]) => void
): () => void {
  const ref = collection(db, COLECAO_OPERADORES);
  return onSnapshot(ref, async (snapshot) => {
    if (snapshot.empty) {
      // Se a coleção estiver vazia no Firestore, inicializa com a lista padrão
      for (const op of OPERADORES) {
        await setDoc(doc(db, COLECAO_OPERADORES, op.id), op);
      }
      return;
    }
    const dados = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Operador));
    callback(dados);
  });
}

// Salva ou atualiza operador no Firestore
export async function salvarOperadorFirestore(operador: Operador): Promise<void> {
  const ref = doc(db, COLECAO_OPERADORES, operador.id);
  await setDoc(ref, operador, { merge: true });
}

// Remove operador do Firestore
export async function removerOperadorFirestore(id: string): Promise<void> {
  const ref = doc(db, COLECAO_OPERADORES, id);
  await deleteDoc(ref);
}


// Ouve todas as requisições em tempo real (exceto ENTREGUE, que vai para histórico)
export function ouvirRequisicoes(
  callback: (requisicoes: Requisicao[]) => void
): () => void {
  const q = query(
    collection(db, COLECAO),
    orderBy('data_criacao', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const dados = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Requisicao));
    callback(dados);
  });
}

// Cria uma nova requisição no Firestore
export async function criarRequisicao(
  dados: Omit<Requisicao, 'id' | 'data_criacao'> & { data_criacao?: string }
): Promise<string> {
  const ref = await addDoc(collection(db, COLECAO), {
    ...dados,
    data_criacao: new Date().toISOString(),
    status: 'PENDENTE',
    separador_id: null,
    separador_nome: null,
    tempo_segundos: 0,
    data_inicio: null,
    data_conclusao_separacao: null,
    data_entrega: null,
    motivo_pausa: null,
  });
  return ref.id;
}

// Assumir separação
export async function assumirSeparacao(
  reqId: string,
  separadorId: string,
  separadorNome: string
): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, {
    status: 'EM_SEPARACAO' as StatusRequisicao,
    separador_id: separadorId,
    separador_nome: separadorNome,
    data_inicio: new Date().toISOString(),
    motivo_pausa: null,
  });
}

// Pausar separação
export async function pausarSeparacao(
  reqId: string,
  motivo: string,
  segundosAcumulados: number
): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, {
    status: 'PAUSADO' as StatusRequisicao,
    motivo_pausa: motivo,
    tempo_segundos: segundosAcumulados,
  });
}

// Retomar separação
export async function retomarSeparacao(reqId: string): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, {
    status: 'EM_SEPARACAO' as StatusRequisicao,
    data_inicio: new Date().toISOString(),
    motivo_pausa: null,
  });
}

// Atualizar item do checklist
export async function atualizarItem(
  reqId: string,
  itens: ItemRequisicao[]
): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, { itens });
}

// Concluir separação (100% separado)
export async function concluirSeparacao(
  reqId: string,
  tempoTotalSegundos: number
): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, {
    status: 'AGUARDANDO_RETIRADA' as StatusRequisicao,
    data_conclusao_separacao: new Date().toISOString(),
    tempo_segundos: tempoTotalSegundos,
  });
}

// Entregar material ao cliente
export async function entregarMaterial(reqId: string): Promise<void> {
  const ref = doc(db, COLECAO, reqId);
  await updateDoc(ref, {
    status: 'ENTREGUE' as StatusRequisicao,
    data_entrega: new Date().toISOString(),
  });
}

// Buscar histórico (ENTREGUE)
export async function buscarHistorico(): Promise<Requisicao[]> {
  try {
    const q = query(
      collection(db, COLECAO),
      where('status', '==', 'ENTREGUE'),
      orderBy('data_entrega', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Requisicao));
  } catch (err) {
    console.warn('Tentando busca sem ordenação indexada...', err);
    try {
      const qFallback = query(
        collection(db, COLECAO),
        where('status', '==', 'ENTREGUE')
      );
      const snap = await getDocs(qFallback);
      const dados = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Requisicao));
      return dados.sort((a, b) => {
        const da = a.data_entrega ? new Date(a.data_entrega).getTime() : 0;
        const db = b.data_entrega ? new Date(b.data_entrega).getTime() : 0;
        return db - da;
      });
    } catch (e2) {
      console.error('Erro ao buscar histórico:', e2);
      return [];
    }
  }
}

// Limpar banco de dados: exclui todas as requisições e reseta operadores opcionais
export async function limparBancoDados(incluirOperadores: boolean = false): Promise<void> {
  // 1. Apaga todas as requisições
  const snapReqs = await getDocs(collection(db, COLECAO));
  const deletePromises = snapReqs.docs.map((d) => deleteDoc(doc(db, COLECAO, d.id)));
  await Promise.all(deletePromises);

  // 2. Se solicitado, reseta também os operadores para a lista padrão
  if (incluirOperadores) {
    const snapOps = await getDocs(collection(db, COLECAO_OPERADORES));
    const deleteOps = snapOps.docs.map((d) => deleteDoc(doc(db, COLECAO_OPERADORES, d.id)));
    await Promise.all(deleteOps);

    for (const op of OPERADORES) {
      await setDoc(doc(db, COLECAO_OPERADORES, op.id), op);
    }
  }
}

