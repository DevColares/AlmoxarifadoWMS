// src/utils/documentParser.ts
// Utilitário para ler texto de arquivos PDF e Imagens (fotos) e extrair dados da Ficha de Separação

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createWorker } from 'tesseract.js';
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
    
    // Agrupa itens de texto por coordenada vertical (Y) com tolerância de ±3px para manter as linhas exatas da tabela
    const itensPosicionados: Array<{ x: number; y: number; str: string }> = [];
    for (const item of content.items as any[]) {
      if (item.str && item.str.trim().length > 0) {
        itensPosicionados.push({
          x: item.transform[4] || 0,
          y: Math.round((item.transform[5] || 0) * 10) / 10,
          str: item.str.trim(),
        });
      }
    }

    // Ordena do topo para a base (Y decrescente)
    itensPosicionados.sort((a, b) => b.y - a.y);

    // Agrupa em linhas por proximidade de Y
    const linhas: Array<Array<{ x: number; str: string }>> = [];
    let linhaAtual: Array<{ x: number; str: string }> = [];
    let yAtual: number | null = null;

    for (const item of itensPosicionados) {
      if (yAtual === null || Math.abs(item.y - yAtual) <= 3.5) {
        linhaAtual.push({ x: item.x, str: item.str });
        if (yAtual === null) yAtual = item.y;
      } else {
        if (linhaAtual.length > 0) {
          // Ordena da esquerda para a direita (X crescente)
          linhaAtual.sort((a, b) => a.x - b.x);
          linhas.push(linhaAtual);
        }
        linhaAtual = [{ x: item.x, str: item.str }];
        yAtual = item.y;
      }
    }
    if (linhaAtual.length > 0) {
      linhaAtual.sort((a, b) => a.x - b.x);
      linhas.push(linhaAtual);
    }

    for (const l of linhas) {
      textoCompleto += l.map((i) => i.str).join(' ') + '\n';
    }
  }

  return textoCompleto;
}

/**
 * Extrai texto de imagens (fotos escaneadas, fotos de celular, PNG/JPG) via Tesseract OCR.
 */
export async function extrairTextoDeImagem(
  file: File,
  onProgress?: (progresso: number) => void
): Promise<string> {
  const worker = await createWorker('por');
  try {
    const ret = await worker.recognize(file);
    return ret.data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Analisa o texto extraído de PDF ou Foto, com suporte especial para Fichas de Separação
 * (ex: Locações | Cód.Peça | Qtde | Descrição | Cliente | Data).
 */
export function analisarTextoRequisicao(texto: string, nomeArquivo: string): DadosRequisicaoExtraidos {
  // 1. Número da Ficha / Nota / Atendimento
  let numero_nota = '';

  // Procura "Ficha de Separação - 42947" ou "Atendimento: 6507843"
  const matchFicha = texto.match(/Ficha(?:\s+de)?\s+Separa[cç][aã]o\s*[-:]?\s*(\d+)/i);
  const matchAtendimento = texto.match(/Atendimento(?:\s*[:\n\r]+)?\s*(\d{5,10})/i);
  const matchGenerico = texto.match(/(?:NF|NOTA|N[ÚU]MERO|ORDEM|REQ(?:UISI[CÇ][AÃ]O)?|N°|Nº)[^\w\d]*([A-Z0-9\-\/]{3,15})/i);

  if (matchFicha && matchFicha[1]) {
    numero_nota = matchFicha[1].trim();
  } else if (matchAtendimento && matchAtendimento[1]) {
    numero_nota = matchAtendimento[1].trim();
  } else if (matchGenerico && matchGenerico[1]) {
    numero_nota = matchGenerico[1].toUpperCase();
    if (!numero_nota.includes('-') && !numero_nota.startsWith('NF')) {
      numero_nota = `NF-${numero_nota}`;
    }
  } else {
    // Fallback: usar o nome do arquivo se contiver número
    const cleanName = nomeArquivo.replace(/\.[a-zA-Z0-9]+$/i, '').replace(/[^a-zA-Z0-9\-_]/g, '');
    numero_nota = cleanName.length > 2 ? cleanName.toUpperCase() : `REC-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  // 2. Extração do Cliente / Solicitante (pega estritamente o NOME após o código do cliente)
  let solicitante = '';

  // Procura a palavra 'Cliente' no texto para não confundir com a natureza de operação (ex: 1840 - VENDA NFE)
  const posCliente = texto.search(/\bCliente\b/i);

  if (posCliente !== -1) {
    const textoAposCliente = texto.slice(posCliente);

    // Procura o padrão de código numérico seguido de hífen logo após o rótulo 'Cliente' (ex: 60202 - TEMA TRANSPORTES ESPECIAL DE)
    const matchComCod = textoAposCliente.match(/\b\d{4,8}\s*[-–—]\s*([^\n\r]+)/);
    if (matchComCod && matchComCod[1]) {
      let nome = matchComCod[1].trim();

      // Delimitadores que marcam o término do nome do cliente quando o PDF junta os blocos de texto
      const delimitadores = [
        /\b(?:DCCO|Filial|Vendedor|NORONHA|Transportadora|E-mail|Email|Data|Atendimento|Qtd|Volumes|Loca[cç][õo]es|C[oó]d|Registros|S[eé]rie)\b/i,
        /\b\d{2}\/\d{2}\/\d{4}\b/, // Datas (ex: 22/10/2026)
        /\b[^\s@]+@[^\s@]+\b/,     // E-mails (ex: tema@...)
        /\b\d{6,8}\b/,              // Números avulsos (ex: 6507843)
      ];

      for (const delim of delimitadores) {
        const idx = nome.search(delim);
        if (idx !== -1) {
          nome = nome.substring(0, idx);
        }
      }

      nome = nome.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();

      if (nome.length > 2 && !/^(?:Loca[cç][õo]es|E-mail|Email|Transportadora)$/i.test(nome)) {
        solicitante = nome;
      }
    }

    // Se não encontrou código numérico, pega o que estiver na linha de 'Cliente:'
    if (!solicitante) {
      const matchLinha = textoAposCliente.match(/Cliente\s*[:\-]?\s*([^\n\r]+)/i);
      if (matchLinha && matchLinha[1]) {
        let raw = matchLinha[1].trim();
        const delimitadores = [
          /\b(?:DCCO|Filial|Vendedor|NORONHA|Transportadora|E-mail|Email|Data|Atendimento|Qtd|Volumes|Loca[cç][õo]es|C[oó]d|Registros|S[eé]rie)\b/i,
          /\b\d{2}\/\d{2}\/\d{4}\b/,
          /\b[^\s@]+@[^\s@]+\b/,
          /\b\d{6,8}\b/,
        ];
        for (const delim of delimitadores) {
          const idx = raw.search(delim);
          if (idx !== -1) raw = raw.substring(0, idx);
        }
        raw = raw.replace(/^\d+\s*[-–—]?\s*/, '').replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();
        if (raw.length > 2 && !/^(?:Loca[cç][õo]es|E-mail|Email|Transportadora)$/i.test(raw)) {
          solicitante = raw;
        }
      }
    }
  }

  // Fallback para outros tipos de documentos (Solicitante / Empresa / Destinatário)
  if (!solicitante) {
    const matchSolicitante = texto.match(/(?:SOLICITANTE|DESTINAT[ÁA]RIO|EMPRESA)\s*[:\-]?\s*([^\n\r]+)/i);
    if (matchSolicitante && matchSolicitante[1]) {
      let raw = matchSolicitante[1].trim();
      raw = raw.split(/\b(?:E-mail|Email|Transportadora|Data|Filial|Vendedor|Atendimento|Qtd|Loca[cç][õo]es)\b/i)[0].trim();
      raw = raw.replace(/^\d+\s*[-–—]?\s*/, '').replace(/^[-–—:\s]+/, '').trim();
      if (raw.length > 2 && !/^(?:Loca[cç][õo]es|E-mail|Email)$/i.test(raw)) {
        solicitante = raw;
      }
    }
  }

  if (!solicitante) {
    solicitante = 'Solicitante não especificado';
  }

  // 3. Extração dos Itens da Tabela (Locações, Cód.Peça, Qtde, Descrição)
  const itens: ItemRequisicao[] = [];
  const linhas = texto.split(/[\r\n]+/);

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l) continue;

    // 1. Ignorar cabeçalhos e rodapés comuns
    if (/^(?:Loca[cç][õo]es|C[oó]d\.?\s*Pe[cç]a|Registros|Observa[cç][aã]o|Separado por|Conferido por|Notas Fiscais|Ficha de Separa|Atendimento|Cliente|Data|Filial)/i.test(l)) {
      continue;
    }

    // 2. Localizar padrão de Locação na linha:
    // Ex: "26A01", "26A010", "A-01-02", "A01-02", "BOX-01", "RUA-01", "01A02", "A01", "DEP-01"
    const regexLocacao = /\b([0-9]{1,3}[A-Z][0-9]{1,3}|[A-Z]-\d{1,2}-\d{1,2}|[A-Z]\d{1,2}-\d{1,2}|[A-Z]{1,4}-\d{1,3}|[A-Z][0-9]{2,3})\b/i;
    const matchLoc = l.match(regexLocacao);

    if (matchLoc) {
      const locacao = matchLoc[1].toUpperCase();

      // Pega o conteúdo antes e depois da locação
      const indiceLoc = l.indexOf(matchLoc[0]);
      const restoLinha = (l.substring(0, indiceLoc) + ' ' + l.substring(indiceLoc + matchLoc[0].length)).trim();

      // Procura tokens na linha
      const tokens = restoLinha.split(/\s+/).filter(Boolean);

      if (tokens.length >= 2) {
        // Encontra o código da peça (token alfanumérico, ex: FF5706I, LF16352I, 3937706, 04103812, MAT-001)
        let codigoIndex = -1;
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          // Código costuma ter letras+números ou ser código numérico de 4+ dígitos
          if (/^[A-Z0-9\-\/]{4,18}$/i.test(t) && !/^\d{1,3}$/.test(t) && !/^(?:UND|UN|PC|CX|KG|M)$/i.test(t)) {
            codigoIndex = i;
            break;
          }
        }

        // Se não achou com critério estrito, assume o primeiro token longo
        if (codigoIndex === -1 && tokens.length > 0) {
          codigoIndex = 0;
        }

        if (codigoIndex !== -1) {
          const codigo = tokens[codigoIndex].toUpperCase();

          // Encontra quantidade (número inteiro ou decimal)
          let qtdIndex = -1;
          for (let i = 0; i < tokens.length; i++) {
            if (i !== codigoIndex && /^\d+(?:[.,]\d+)?(?:\s*(?:un|und|pc|pça|cx|kg|m))?$/i.test(tokens[i])) {
              qtdIndex = i;
              break;
            }
          }

          let quantidade = '1 und';
          if (qtdIndex !== -1) {
            const rawQtd = tokens[qtdIndex];
            quantidade = /[a-zA-Z]/.test(rawQtd) ? rawQtd : `${rawQtd} und`;
          }

          // Descrição do material é tudo o que sobrar
          const indicesUsados = new Set([codigoIndex, qtdIndex]);
          let descricaoTokens = tokens.filter((_, idx) => !indicesUsados.has(idx));

          // Limpa marcadores comuns de rodapé
          let descricao = descricaoTokens.join(' ').replace(/\b(?:Observa[cç][aã]o|Registros|Separado|Conferido).*/i, '').trim();

          if (descricao.length < 2) {
            descricao = `Material ${codigo}`;
          }

          // Adiciona se não for duplicata idêntica
          if (!itens.some(it => it.codigo === codigo && it.localizacao === locacao)) {
            itens.push({
              codigo,
              nome: descricao,
              localizacao: locacao,
              quantidade,
              separado: false,
            });
            continue;
          }
        }
      }
    }

    // 3. Fallback genérico caso a linha não tenha o formato padrão de locação
    const matchCod = l.match(/\b([A-Z]{2,5}-\d{3,6}|[A-Z]{2}\d{4,6}[A-Z]?|\d{5,8})\b/i);
    const matchQtd = l.match(/\b(\d+(?:[.,]\d+)?\s*(?:unidades?|pe[cç]as?|metros?|un|und|p[cç]|cx|kg|pct|m)?)\b/i);

    if (matchCod && (matchLoc || matchQtd) && l.length > 6) {
      const codigo = matchCod[1].toUpperCase();
      const localizacao = matchLoc ? matchLoc[1].toUpperCase() : 'A-01-01';
      let quantidade = matchQtd ? matchQtd[1] : '1 und';
      if (!/[a-zA-Z]/.test(quantidade)) {
        quantidade = `${quantidade.trim()} und`;
      }

      let nome = l
        .replace(matchCod[0], '')
        .replace(matchLoc ? matchLoc[0] : '', '')
        .replace(matchQtd ? matchQtd[0] : '', '')
        .replace(/^[\s\-_.:;]+|[\s\-_.:;]+$/g, '')
        .trim();

      if (nome.length < 3) {
        nome = `Material ${codigo}`;
      }

      if (!itens.some(it => it.codigo === codigo && it.localizacao === localizacao)) {
        itens.push({
          codigo,
          nome,
          localizacao,
          quantidade,
          separado: false,
        });
      }
    }
  }

  // Fallback se não conseguiu quebrar por linhas (ex: OCR tudo em 1 linha contínua)
  if (itens.length === 0) {
    const regexSeq = /([0-9]{1,3}[A-Z][0-9]{2,3}|[A-Z]-\d{2}-\d{2})\s+([A-Z0-9\-\/]{4,15})\s+(\d+)\s+([A-Z\s0-9]{4,50}?)(?=[0-9]{1,3}[A-Z][0-9]{2,3}|Registros|Observa|$)/gi;
    let seqMatch;
    while ((seqMatch = regexSeq.exec(texto)) !== null) {
      const q = seqMatch[3].trim();
      itens.push({
        localizacao: seqMatch[1].toUpperCase(),
        codigo: seqMatch[2].toUpperCase(),
        quantidade: `${q} und`,
        nome: seqMatch[4].trim(),
        separado: false,
      });
    }
  }

  // Se mesmo assim nenhum item foi parseado, cria 1 item genérico com o nome do arquivo
  if (itens.length === 0) {
    itens.push({
      codigo: 'MAT-001',
      nome: 'Material importado (' + nomeArquivo + ')',
      localizacao: 'A-01-01',
      quantidade: '1 und',
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
