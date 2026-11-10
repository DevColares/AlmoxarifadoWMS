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
 * Pré-processa uma imagem para otimizar a legibilidade pelo OCR:
 * - Redimensiona se for muito pequena
 * - Converte para tons de cinza
 * - Aplica filtro de alto contraste e binarização seletiva
 */
async function preprocessarImagemParaOCR(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(url);
        return;
      }

      // Escala mínima recomendada para Tesseract ler fontes pequenas de tabela
      let scale = 1;
      if (img.width < 1500) {
        scale = Math.min(2.5, 1800 / img.width);
      }

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      // Ajuste de contraste e níveis de cinza
      // Fator de contraste: 1.3
      const contrast = 1.3;
      const intercept = 128 * (1 - contrast);

      for (let i = 0; i < d.length; i += 4) {
        // Luminância perceptiva (Rec. 709)
        const gray = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        let cGray = gray * contrast + intercept;
        if (cGray > 255) cGray = 255;
        if (cGray < 0) cGray = 0;

        d[i] = cGray;
        d[i + 1] = cGray;
        d[i + 2] = cGray;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      resolve(url);
    };

    img.src = url;
  });
}

/**
 * Normaliza erros comuns de leitura de caracteres que o OCR costuma confundir
 */
function normalizarRuidoOCR(str: string): string {
  return str
    .replace(/[|│]/g, ' ')
    .replace(/[“”"„]/g, '')
    .trim();
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
    // Configurações do Tesseract para reconhecimento de documentos tabulares
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as any, // Assume a single uniform block of text
      preserve_interword_spaces: '1',
    });

    const imagemOtimizada = await preprocessarImagemParaOCR(file);
    const ret = await worker.recognize(imagemOtimizada);
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

    // Procura o padrão: "Cliente:" seguido opcionalmente de código de 4 a 8 dígitos e hífen (ex: "546805 - J S COMERCIO DE PECAS PARA")
    const matchComCod = textoAposCliente.match(/Cliente\s*[:\-]?\s*(?:\d{4,8}\s*[-–—]\s*)?([^\n\r]+)/i);
    if (matchComCod && matchComCod[1]) {
      let nome = matchComCod[1].trim();

      // Se o início ainda contiver "546805 - ", remove o código numérico e traço
      nome = nome.replace(/^\d{4,8}\s*[-–—:\s]+\s*/, '');

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

  // 3. Extração dos Itens da Tabela (Locações -> Cód.Peça -> Qtde -> Descrição)
  const itens: ItemRequisicao[] = [];
  const linhasTexto = texto.split(/[\r\n]+/);

    // Pré-filtra e limpa cada linha
    const linhas: string[] = [];
    for (const rawL of linhasTexto) {
      const l = normalizarRuidoOCR(rawL);
      if (!l) continue;
        // Ignora cabeçalhos, rodapés e metadados
        if (/^(?:Loca[cç][õo]es|C[oó]d\.?\s*Pe[cç]a|Registros|Observa[cç][aã]o|Separado por|Conferido por|Notas Fiscais|Ficha de Separa|Atendimento|Cliente|Data|Filial|Vendedor|E-mail|PIX|S[eé]rie)/i.test(l)) {
          continue;
        }
        linhas.push(l);
      }

      // Regex para Locação:
      // Ex: "21A01", "26A010", "A-01-02", "BOX-01", "01A02", etc.
      const regexLocacao = /\b([0-9]{1,3}[A-Z][0-9]{1,4}|[A-Z]-\d{1,2}-\d{1,2}|[A-Z]\d{1,2}-\d{1,2}|[A-Z]{1,4}-\d{1,3}|[A-Z][0-9]{2,3})\b/i;

      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];

        // Verifica se a linha inicia ou contém um padrão de locação
        const matchLoc = l.match(regexLocacao);

          if (matchLoc && matchLoc.index !== undefined) {
            const locacao = matchLoc[1].toUpperCase();

            // Pega o conteúdo a partir e após a locação
            const indiceLoc = matchLoc.index;
            // Parte restante da linha (preferencialmente após a locação)
            const aposLoc = l.substring(indiceLoc + matchLoc[0].length).trim();
            const antesLoc = l.substring(0, indiceLoc).trim();
            const restoLinha = aposLoc.length > 0 ? aposLoc : antesLoc;

            // Padrão específico da Ficha: [Cód.Peça] [Qtde] [Descrição...]
            // Exemplo: "LF670I 24 FILTRO DE OLEO LUBRIFICANTE"
            const matchSequencial = restoLinha.match(/^([A-Z0-9\-\/]{4,18})\s+(\d+(?:[.,]\d+)?(?:\s*(?:un|und|pc|pça|cx|kg|m))?)\s*(.*)$/i);

              let codigo = '';
              let quantidade = '1 und';
              let descricao = '';

              if (matchSequencial) {
                codigo = matchSequencial[1].toUpperCase();
                const rawQtd = matchSequencial[2].trim();
                quantidade = /[a-zA-Z]/.test(rawQtd) ? rawQtd : `${rawQtd} und`;
                descricao = matchSequencial[3].trim();
              } else {
                // Se a ordem não estiver estritamente sequencial, analisa tokens
                const tokens = (restoLinha + ' ' + (aposLoc.length > 0 ? antesLoc : '')).trim().split(/\s+/).filter(Boolean);

                  if (tokens.length >= 2) {
                    // 1º token costuma ser o Cód. Peça
                    let codIdx = -1;
                    for (let t = 0; t < tokens.length; t++) {
                      if (/^[A-Z0-9\-\/]{4,18}$/i.test(tokens[t]) && !/^\d{1,3}$/.test(tokens[t]) && !/^(?:UND|UN|PC|CX|KG|M)$/i.test(tokens[t])) {
                        codIdx = t;
                        break;
                      }
                    }
                    if (codIdx === -1) codIdx = 0;
                    codigo = tokens[codIdx].toUpperCase();

                        // 2º elemento costuma ser a Quantidade
                        let qtdIdx = -1;
                        for (let t = 0; t < tokens.length; t++) {
                          if (t !== codIdx && /^\d+(?:[.,]\d+)?(?:\s*(?:un|und|pc|pça|cx|kg|m))?$/i.test(tokens[t])) {
                            qtdIdx = t;
                            break;
                          }
                        }

                          if (qtdIdx !== -1) {
                            const rawQtd = tokens[qtdIdx];
                            quantidade = /[a-zA-Z]/.test(rawQtd) ? rawQtd : `${rawQtd} und`;
                          }

                          const indicesUsados = new Set([codIdx, qtdIdx]);
                          descricao = tokens.filter((_, idx) => !indicesUsados.has(idx)).join(' ').trim();
                        }
                      }

                      // Suporte para descrição que quebrou em 2 linhas (ex: "FILTRO DE OLEO LUBRIFICANTE" e na linha seguinte "CS192077")
                      if (i + 1 < linhas.length) {
                        const proxLinha = linhas[i + 1].trim();
                        // Se a próxima linha NÃO tem uma nova locação e não é cabeçalho/observação, pertence à descrição do item atual
                        if (!proxLinha.match(regexLocacao) && !/^(?:Registros|Observa[cç][aã]o|Separado|Conferido)/i.test(proxLinha)) {
                          descricao = (descricao ? `${descricao} ` : '') + proxLinha;
                          i++; // avança para não processar a linha complementar como item separado
                        }
                      }

                      // Limpeza de rodapés eventuais na descrição
                      descricao = descricao.replace(/\b(?:Registros|Observa[cç][aã]o|Separado|Conferido).*/i, '').trim();

                      if (!descricao || descricao.length < 2) {
                        descricao = `Material ${codigo || locacao}`;
                      }

                      if (codigo) {
                        // Evita duplicatas idênticas
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

                    // Fallback genérico caso a linha não tenha o padrão exato de início de locação
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
