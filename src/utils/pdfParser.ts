// src/utils/pdfParser.ts
// Utilitário para ler texto de arquivos PDF e extrair dados da requisição

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ItemRequisicao } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface DadosRequisicaoExtraidos {
  numero_nota: string;
  solicitante: string;
  itens: ItemRequisicao[];
  textoBruto: string;
}

/**
 * Lê o arquivo PDF carregado pelo usuário e extrai todo o texto.
 */
export async function extrairTextoDoPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  let textoCompleto = '';

  for (let numPagina = 1; numPagina <= pdfDoc.numPages; numPagina++) {
    const page = await pdfDoc.getPage(numPagina);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item: any) => item.str || '')
      .filter((s: string) => s.trim().length > 0);
    textoCompleto += strings.join(' ') + '\n';
  }

  return textoCompleto;
}

/**
 * Analisa o texto extraído do PDF procurando por padrões de NF/Nota, Solicitante e Itens.
 */
export function analisarTextoRequisicao(texto: string, nomeArquivo: string): DadosRequisicaoExtraidos {
  // 1. Extração do Número da Nota
  let numero_nota = '';
  const matchNota =
    texto.match(/(?:NF|NOTA|N[ÚU]MERO|ORDEM|REQ(?:UISI[CÇ][AÃ]O)?|N°|Nº)[^\w\d]*([A-Z0-9\-\/]{3,15})/i) ||
    texto.match(/\b([A-Z]{2,3}-\d{4,8})\b/i);

  if (matchNota && matchNota[1]) {
    numero_nota = matchNota[1].toUpperCase();
    if (!numero_nota.includes('-') && !numero_nota.startsWith('NF')) {
      numero_nota = `NF-${numero_nota}`;
    }
  } else {
    // Fallback: usar o próprio nome do arquivo se tiver padrão
    const cleanName = nomeArquivo.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9\-_]/g, '');
    numero_nota = cleanName.length > 2 ? cleanName.toUpperCase() : `NF-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  // 2. Extração do Solicitante / Cliente / Destinatário
  let solicitante = '';
  const matchSolicitante =
    texto.match(/(?:SOLICITANTE|CLIENTE|DESTINAT[ÁA]RIO|SETOR|DEPARTAMENTO|EMPRESA)[:\s\-]+([^\n\r,;]{3,40})/i) ||
    texto.match(/(?:PARA|PEDIDO)[:\s\-]+([^\n\r,;]{3,40})/i);

  if (matchSolicitante && matchSolicitante[1]) {
    solicitante = matchSolicitante[1].trim();
  } else {
    solicitante = 'Solicitante não especificado';
  }

  // 3. Extração dos Itens
  const itens: ItemRequisicao[] = [];
  const linhas = texto.split(/[\r\n]+/);

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l) continue;

    // Procura padrões como "MAT-0045" ou "COD-1234" ou "00123"
    const matchCod = l.match(/\b([A-Z]{2,5}-\d{3,6}|\d{4,8})\b/i);
    // Procura localização no formato "A-01-02", "BOX-01", "RUA-02"
    const matchLoc = l.match(/\b([A-Z]-\d{2}-\d{2}|[A-Z]\d{2}-\d{2}|[A-Z]{1,3}-\d{1,3})\b/i);
    // Procura quantidades como "10 un", "5 peças", "50 metros", "10cx", "2"
    const matchQtd = l.match(/(\d+(?:[.,]\d+)?\s*(?:unidades?|pe[cç]as?|metros?|un|p[cç]|cx|kg|pct|m|rolo[s]?|varas?))/i);

    if (matchCod || matchLoc || (matchQtd && l.length > 10)) {
      const codigo = matchCod ? matchCod[1].toUpperCase() : `MAT-${Math.floor(1000 + Math.random() * 9000)}`;
      const localizacao = matchLoc ? matchLoc[1].toUpperCase() : 'A-01-01';
      const quantidade = matchQtd ? matchQtd[1] : '1 un';

      // Nome/Descrição: remove o código e a localização da linha
      let nome = l
        .replace(codigo, '')
        .replace(localizacao, '')
        .replace(quantidade, '')
        .replace(/^[\s\-_.:;]+|[\s\-_.:;]+$/g, '')
        .trim();

      if (nome.length < 3) {
        nome = `Material ${codigo}`;
      }

      itens.push({
        codigo,
        nome,
        localizacao,
        quantidade,
        separado: false,
      });
    }
  }

  // Se nenhum item foi parseado por linha específica, cria ao menos 1 item com resumo do documento
  if (itens.length === 0) {
    itens.push({
      codigo: 'MAT-001',
      nome: 'Material importado via PDF (' + nomeArquivo + ')',
      localizacao: 'A-01-01',
      quantidade: '1 un',
      separado: false,
    });
  }

  return {
    numero_nota,
    solicitante,
    itens,
    textoBruto: texto,
  };
}
