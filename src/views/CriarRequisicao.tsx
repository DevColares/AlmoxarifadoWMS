// src/views/CriarRequisicao.tsx
// Tela para o Líder importar requisições via Upload de PDF ou Foto/Imagem (OCR)

import React, { useState, useRef } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle,
  ChevronLeft, Trash2, Package, MapPin, Hash, Layers, RefreshCw, Image as ImageIcon
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { criarRequisicao } from '../firebase/firestore';
import { ItemRequisicao } from '../types';
import {
  extrairTextoDoPdf,
  extrairTextoDeImagem,
  analisarTextoRequisicao,
  DadosRequisicaoExtraidos
} from '../utils/documentParser';

export function CriarRequisicao() {
  const { operadorAtivo, setViewAtual, enviarNotificacao } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [mensagemProcessamento, setMensagemProcessamento] = useState('Processando arquivo...');
  const [salvando, setSalvando] = useState(false);
  const [dadosExtraidos, setDadosExtraidos] = useState<DadosRequisicaoExtraidos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Apenas o líder pode criar requisições
  if (operadorAtivo.papel !== 'lider') {
    return (
      <main className="main-content">
        <div className="empty-state">
          <AlertTriangle size={64} style={{ opacity: 0.3, color: 'var(--clr-amber)' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Acesso Restrito</h2>
          <p className="text-sm">Somente o Líder tem permissão para importar novas requisições.</p>
          <button className="btn btn-ghost" onClick={() => setViewAtual('painel')}>
            <ChevronLeft size={14} /> Voltar ao Painel
          </button>
        </div>
      </main>
    );
  }

  const handleFileChange = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      setErro('Por favor, selecione um arquivo válido no formato PDF ou Imagem/Foto (JPG, PNG).');
      return;
    }

    setArquivo(file);
    setProcessando(true);
    setErro(null);

    try {
      let texto = '';
      if (isPdf) {
        setMensagemProcessamento('Lendo texto e tabelas do PDF...');
        texto = await extrairTextoDoPdf(file);
      } else {
        setMensagemProcessamento('Executando OCR na foto/imagem...');
        texto = await extrairTextoDeImagem(file);
      }

      const parsed = analisarTextoRequisicao(texto, file.name);
      setDadosExtraidos(parsed);
      enviarNotificacao('Documento Carregado', `${parsed.itens.length} itens estruturados detectados.`, 'sucesso');
    } catch (err: any) {
      console.error('Erro ao ler documento:', err);
      setErro('Não foi possível ler o texto do arquivo. Verifique a qualidade da imagem ou se o PDF está acessível.');
    } finally {
      setProcessando(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const editarItem = (idx: number, campo: keyof ItemRequisicao, valor: string) => {
    if (!dadosExtraidos) return;
    const novosItens = dadosExtraidos.itens.map((it, i) =>
      i === idx ? { ...it, [campo]: valor } : it
    );
    setDadosExtraidos({ ...dadosExtraidos, itens: novosItens });
  };

  const removerItem = (idx: number) => {
    if (!dadosExtraidos) return;
    const novosItens = dadosExtraidos.itens.filter((_, i) => i !== idx);
    setDadosExtraidos({ ...dadosExtraidos, itens: novosItens });
  };

  const adicionarItemVazio = () => {
    if (!dadosExtraidos) return;
    setDadosExtraidos({
      ...dadosExtraidos,
      itens: [
        ...dadosExtraidos.itens,
        { codigo: '', nome: '', localizacao: '', quantidade: '1', separado: false },
      ],
    });
  };

  const salvar = async () => {
    if (!dadosExtraidos) return;

    if (!dadosExtraidos.numero_nota.trim()) {
      enviarNotificacao('Atenção', 'Informe o número da nota ou ficha.', 'aviso');
      return;
    }

    if (dadosExtraidos.itens.length === 0) {
      enviarNotificacao('Atenção', 'A requisição deve ter pelo menos 1 item.', 'aviso');
      return;
    }

    setSalvando(true);
    try {
      await criarRequisicao({
        numero_nota: dadosExtraidos.numero_nota.trim(),
        solicitante: dadosExtraidos.solicitante.trim() || 'Não informado',
        status: 'PENDENTE',
        criado_por: operadorAtivo.nome,
        separador_id: null,
        separador_nome: null,
        tempo_segundos: 0,
        data_inicio: null,
        data_conclusao_separacao: null,
        data_entrega: null,
        motivo_pausa: null,
        itens: dadosExtraidos.itens,
      });

      enviarNotificacao('✅ Requisição Criada!', `${dadosExtraidos.numero_nota} importada com sucesso.`, 'sucesso');
      setViewAtual('painel');
    } catch (err: any) {
      console.error('Erro ao salvar requisição:', err);
      enviarNotificacao('Erro', 'Não foi possível salvar no Firebase.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const limparArquivo = () => {
    setArquivo(null);
    setDadosExtraidos(null);
    setErro(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <main className="main-content">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-4">
        <button className="btn btn-ghost btn-sm" onClick={() => setViewAtual('painel')} id="btn-voltar-criar">
          <ChevronLeft size={15} />
        </button>
        <div>
          <h1 className="font-bold" style={{ fontSize: '1.3rem' }}>Importar Requisição via PDF ou Foto</h1>
          <p className="text-sm text-muted">Faça o upload do documento PDF ou foto da Ficha de Separação / Nota Fiscal</p>
        </div>
      </div>

      {/* Área de Upload Drag & Drop */}
      {!dadosExtraidos ? (
        <div className="card mb-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--clr-primary, #6366f1)' : 'var(--clr-border)'}`,
              background: dragOver ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              accept=".pdf,application/pdf,image/*"
              style={{ display: 'none' }}
              id="input-file-doc"
            />

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Upload
                size={38}
                style={{
                  color: dragOver ? 'var(--clr-primary, #6366f1)' : 'var(--clr-muted, #94a3b8)',
                }}
              />
              <ImageIcon
                size={38}
                style={{
                  color: dragOver ? 'var(--clr-primary, #6366f1)' : 'var(--clr-muted, #94a3b8)',
                }}
              />
            </div>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {processando ? mensagemProcessamento : 'Arraste seu PDF ou Foto aqui ou clique para selecionar'}
            </h3>
            <p className="text-sm text-muted" style={{ maxWidth: 480, margin: '0 auto' }}>
              O sistema extrai e estrutura automaticamente: <strong>Ficha / NF</strong>, <strong>Cliente</strong>, <strong>Locações</strong>, <strong>Cód. Peça</strong>, <strong>Qtde</strong> e <strong>Descrição</strong>.
            </p>

            {processando && (
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span className="text-sm">{mensagemProcessamento}</span>
              </div>
            )}
          </div>

          {erro && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius, 8px)', color: '#ef4444', fontSize: '0.85rem' }}>
              ⚠️ {erro}
            </div>
          )}
        </div>
      ) : (
        /* Revisão e Confirmação dos Dados Extraídos */
        <>
          <div className="card mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {arquivo?.type.startsWith('image/') ? (
                <ImageIcon size={24} style={{ color: 'var(--clr-primary, #6366f1)' }} />
              ) : (
                <FileText size={24} style={{ color: 'var(--clr-primary, #6366f1)' }} />
              )}
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem' }}>{arquivo?.name}</strong>
                <span className="text-xs text-muted">
                  {((arquivo?.size || 0) / 1024).toFixed(1)} KB • {dadosExtraidos.itens.length} itens identificados
                </span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={limparArquivo} style={{ color: 'var(--clr-rose)' }}>
              <RefreshCw size={13} /> Trocar Arquivo
            </button>
          </div>

          <div className="card mb-4">
            <div className="section-title"><Hash size={14} /> Dados Identificados no Documento</div>
            <div className="grid col-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor="input-doc-numero-nota">Número da Ficha / Requisição</label>
                <input
                  id="input-doc-numero-nota"
                  type="text"
                  className="form-input"
                  value={dadosExtraidos.numero_nota}
                  onChange={(e) => setDadosExtraidos({ ...dadosExtraidos, numero_nota: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="input-doc-solicitante">Cliente / Solicitante</label>
                <input
                  id="input-doc-solicitante"
                  type="text"
                  className="form-input"
                  value={dadosExtraidos.solicitante}
                  onChange={(e) => setDadosExtraidos({ ...dadosExtraidos, solicitante: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Lista de Itens Extraídos Estruturados */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="section-title" style={{ margin: 0 }}>
                <Layers size={14} /> Itens da Ficha ({dadosExtraidos.itens.length})
              </div>
              <button className="btn btn-ghost btn-sm" onClick={adicionarItemVazio}>
                + Adicionar Item
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dadosExtraidos.itens.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 180px 110px 1fr 40px',
                    gap: '0.75rem',
                    alignItems: 'center',
                    background: 'var(--clr-surface)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius, 8px)',
                    border: '1px solid var(--clr-border)',
                  }}
                >
                  <div>
                    <label className="text-xs text-muted block mb-1 font-semibold">Locação</label>
                    <input
                      type="text"
                      className="form-input font-mono font-bold"
                      style={{ padding: '0.45rem 0.6rem', fontSize: '0.95rem', color: 'var(--clr-amber, #f59e0b)' }}
                      value={item.localizacao}
                      placeholder="26A01"
                      onChange={(e) => editarItem(idx, 'localizacao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted block mb-1 font-semibold">Cód. Peça (Destaque)</label>
                    <input
                      type="text"
                      className="form-input font-mono font-bold"
                      style={{
                        padding: '0.45rem 0.6rem',
                        fontSize: '1.15rem',
                        letterSpacing: '0.04em',
                        color: 'var(--clr-primary, #6366f1)',
                        borderColor: 'rgba(99, 102, 241, 0.4)'
                      }}
                      value={item.codigo}
                      placeholder="FF5706I"
                      onChange={(e) => editarItem(idx, 'codigo', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted block mb-1 font-semibold">Quantidade</label>
                    <input
                      type="text"
                      className="form-input font-bold"
                      style={{
                        padding: '0.45rem 0.6rem',
                        fontSize: '1.05rem',
                        textAlign: 'center',
                        color: 'var(--clr-emerald, #10b981)',
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        background: 'rgba(16, 185, 129, 0.05)'
                      }}
                      value={item.quantidade}
                      placeholder="1 und"
                      onChange={(e) => editarItem(idx, 'quantidade', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted block mb-1">Descrição</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem', color: 'var(--clr-muted)' }}
                      value={item.nome}
                      placeholder="Descrição do material..."
                      onChange={(e) => editarItem(idx, 'nome', e.target.value)}
                    />
                  </div>

                  <div style={{ paddingTop: '1.2rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removerItem(idx)}
                      style={{ color: 'var(--clr-rose)', padding: '0.35rem' }}
                      title="Remover este item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-3 justify-end">
            <button className="btn btn-ghost" onClick={limparArquivo} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando} id="btn-confirmar-importacao">
              {salvando ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Publicando no Painel...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Confirmar e Estruturar no Painel
                </>
              )}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
