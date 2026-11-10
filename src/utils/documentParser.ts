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
 * Converte um arquivo File para Base64 (sem o prefixo data:...)
 */
async function fileParaBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const partes = res.split(',');
      const mimeType = partes[0].match(/:(.*?);/)?.[1] || file.type || 'image/jpeg';
      resolve({ base64: partes[1], mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extração de dados da Ficha via Google Gemini Flash Vision
 * Retorna os dados estruturados diretamente em JSON com 100% de fidelidade
 */
export async function extrairComGeminiVision(
  file: File,
  apiKey: string
): Promise<DadosRequisicaoExtraidos> {
  const { base64, mimeType } = await fileParaBase64(file);

  const prompt = `Analise atentamente esta imagem de Ficha de Separação de Almoxarifado / WMS.
Extraia com máxima fidelidade e retorne ESTRITAMENTE um JSON no formato especificado:

{
  "numero_nota": "Número da ficha ou atendimento (ex: 43127 ou 6541489)",
  "solicitante": "Nome ou Razão Social do cliente (localizado após a palavra 'Cliente:' e após o código numérico, excluindo e-mail e outros campos)",
  "itens": [
    {
      "localizacao": "Locação da peça na tabela (ex: 06F01, 14A02, 14E01, etc)",
      "codigo": "Código da peça (ex: 3058383, 3056155, FS1212)",
      "quantidade": "Quantidade com a unidade (ex: '2 und', '1 und', '6 und')",
      "nome": "Descrição completa do material (ex: 'CORREIA V8383', 'PULVERIZADOR DE RESFRIAMENTO DO PISTAO4822')"
    }
  ]
}

Regras obrigatórias:
1. Extraia rigorosamente TODOS os itens da tabela de separação, sem omitir nenhuma linha.
2. Cada linha da tabela é lida da esquerda para a direita: Locações -> Cód.Peça -> Qtde -> Descrição.
3. Se a descrição do material estiver em mais de uma linha na tabela, junte as linhas em um único texto para aquele item.
4. Não invente itens do cabeçalho como 'VENDA NFE' ou vendedor.
5. Retorne APENAS o JSON puro, sem crases de markdown e sem explicações adicionais.`;

  // Modelos suportados na API Gemini com fallback automático
  const modelos = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro-vision'];
  let ultimoErro = '';

  for (const modelo of modelos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText);

        const itensFormatados: ItemRequisicao[] = (parsed.itens || []).map((it: any) => ({
          codigo: String(it.codigo || 'MAT-001').trim(),
          nome: String(it.nome || 'Material').trim(),
          localizacao: String(it.localizacao || 'A-01-01').trim(),
          quantidade: String(it.quantidade || '1 und').includes('und') ? String(it.quantidade) : `${it.quantidade} und`,
          separado: false,
        }));

        return {
          numero_nota: String(parsed.numero_nota || `FICHA-${Date.now().toString().slice(-5)}`),
          solicitante: String(parsed.solicitante || 'Cliente não identificado'),
          itens: itensFormatados,
          textoBruto: rawText,
        };
      } else {
        const errData = await response.json().catch(() => ({}));
        ultimoErro = errData?.error?.message || `Erro ${response.status} no modelo ${modelo}`;
      }
    } catch (e: any) {
      ultimoErro = e?.message || 'Falha na conexão com a API Gemini';
    }
  }

  throw new Error(ultimoErro || 'Não foi possível comunicar com a API do Gemini');
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
    // Substitui O (letra O maiúscula) ou o minúsculo por 0 se estiver no padrão de locação (ex: 06F0l -> 06F01, O6F01 -> 06F01)
    .replace(/\b[oO](\d[A-Z]\d{2})\b/g, '0$1')
    .replace(/\b(\d{2}[A-Z]\d)[oO]\b/g, '$10')
    .replace(/\b(\d{2}[A-Z]\d)[lI]\b/g, '$11')
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
    // Modo 4 (Assume a single column of text of variable sizes) ou Modo 6
    // Para tabelas de notas fiscais, PSM 4 ou 11 preserva muito melhor a separação entre colunas
    await worker.setParameters({
      tessedit_pageseg_mode: '4' as any,
      preserve_interword_spaces: '1',
    });

    // 1ª tentativa direta com a imagem original
    const ret1 = await worker.recognize(file);
    let texto1 = ret1.data.text || '';

    // Se o texto tiver poucas linhas ou poucos itens, tenta com a imagem pré-processada em alto contraste
    const contagemLocacoes = (texto1.match(/\b[0-9]{1,3}[A-Z][0-9]{1,4}\b/gi) || []).length;
    if (contagemLocacoes < 5) {
      const imagemOtimizada = await preprocessarImagemParaOCR(file);
      const ret2 = await worker.recognize(imagemOtimizada);
      const texto2 = ret2.data.text || '';
      const contagemLocacoes2 = (texto2.match(/\b[0-9]{1,3}[A-Z][0-9]{1,4}\b/gi) || []).length;
      if (contagemLocacoes2 > contagemLocacoes) {
        return texto2;
      }
    }

    return texto1;
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
    // Ignora estritamente cabeçalhos, rodapés e linhas de metadados
    if (/^(?:Loca[cç][õo]es|C[oó]d\.?\s*Pe[cç]a|Registros|Observa[cç][aã]o|Separado|Conferido|Notas Fiscais|Ficha de Separa|Atendimento|Cliente|Data|Filial|Vendedor|E-mail|Email|PIX|S[eé]rie|A PRAZO|FAVOR COLOCAR|\d{3,5}\s*-\s*VENDA)/i.test(l)) {
      continue;
    }
    // Ignora linhas de cabeçalho da empresa (ex: DCCO NORTE, VENDA NFE)
    if (/(?:VENDA NFE|NOROESTE|AMAZONIA|SOLUCOES EM ENER)/i.test(l)) {
      continue;
    }
    linhas.push(l);
  }

  // Regex para Locação: ex: "06F01", "14A02", "14E01", "15A04", "16E02", "16F02", "26D01", "21A01"
  const regexLocacao = /\b([0-9]{1,3}[A-Z][0-9]{1,4}|[A-Z]-\d{1,2}-\d{1,2}|[A-Z]\d{1,2}-\d{1,2})\b/i;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];

    // Ignora linhas de ruído numérico curto
    if (/^[\d\s\-_]+$/.test(l) && l.length < 8) continue;

    const matchLoc = l.match(regexLocacao);

    if (matchLoc && matchLoc.index !== undefined) {
      const locacao = matchLoc[1].toUpperCase();

      // Conteúdo após e antes da locação
      const indiceLoc = matchLoc.index;
      const aposLoc = l.substring(indiceLoc + matchLoc[0].length).trim();
      const antesLoc = l.substring(0, indiceLoc).trim();
      const conteudoLinha = aposLoc.length > 0 ? aposLoc : antesLoc;

      // Padrão estruturado: [Cód.Peça] [Qtde] [Descrição...]
      // Exemplo: "3058383 2 CORREIA V8383"
      const matchEstruturado = conteudoLinha.match(/^([A-Z0-9\-\/]{4,18})\s+(\d+)\s+(.+)$/i);

      let codigo = '';
      let quantidade = '1 und';
      let descricao = '';

      if (matchEstruturado) {
        codigo = matchEstruturado[1].toUpperCase();
        quantidade = `${matchEstruturado[2].trim()} und`;
        descricao = matchEstruturado[3].trim();
      } else {
        const tokens = conteudoLinha.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          codigo = tokens[0].toUpperCase();
          if (/^\d+$/.test(tokens[1])) {
            quantidade = `${tokens[1]} und`;
            descricao = tokens.slice(2).join(' ').trim();
          } else {
            const qIdx = tokens.findIndex((t, idx) => idx > 0 && /^\d+$/.test(t));
            if (qIdx !== -1) {
              quantidade = `${tokens[qIdx]} und`;
              descricao = tokens.filter((_, idx) => idx !== 0 && idx !== qIdx).join(' ').trim();
            } else {
              descricao = tokens.slice(1).join(' ').trim();
            }
          }
        }
      }

      // Suporte para descrição em múltiplas linhas (continuação na linha seguinte)
      while (i + 1 < linhas.length) {
        const proxLinha = linhas[i + 1].trim();
        // Não consome a linha se ela contiver uma locação válida (para não engolir o próximo item!)
        if (proxLinha.match(regexLocacao)) {
          break;
        }

        // Não consome se a linha começar com um código de peça seguido de número
        if (/^[A-Z0-9\-\/]{4,18}\s+\d+/i.test(proxLinha)) {
          break;
        }

        if (
          !/^(?:Registros|Observa[cç][aã]o|Separado|Conferido|Data|Cliente|Filial|Vendedor)/i.test(proxLinha) &&
          !/^(?:FAVOR COLOCAR|\d+\s*$)/i.test(proxLinha)
        ) {
          descricao = (descricao ? `${descricao} ` : '') + proxLinha;
          i++;
        } else {
          break;
        }
      }

      descricao = descricao.replace(/\b(?:Registros|Observa[cç][aã]o|Separado|Conferido).*/i, '').trim();

      if (!descricao || descricao.length < 2) {
        descricao = `Material ${codigo}`;
      }

      if (codigo && locacao) {
        if (!itens.some((it) => it.codigo === codigo && it.localizacao === locacao)) {
          itens.push({
            codigo: codigo,
            nome: descricao,
            localizacao: String(locacao),
            quantidade: quantidade,
            separado: false,
          });
        }
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
