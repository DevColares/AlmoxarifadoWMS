// src/components/NavTabs.tsx
// Barra de navegação com abas principais

import React from 'react';
import { LayoutGrid, ClipboardList, UploadCloud, BarChart3, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ViewType } from '../types';

interface TabConfig {
  id: ViewType;
  label: string;
  icon: React.ReactNode;
  apenasLider?: boolean;
}

const TABS: TabConfig[] = [
  { id: 'painel', label: 'Painel', icon: <LayoutGrid size={16} /> },
  { id: 'checklist', label: 'Minha Sep.', icon: <ClipboardList size={16} /> },
  { id: 'criar', label: 'Upload PDF', icon: <UploadCloud size={16} />, apenasLider: true },
  { id: 'metricas', label: 'Métricas', icon: <BarChart3 size={16} /> },
  { id: 'configuracoes', label: 'Config.', icon: <Settings size={16} /> },
];

export function NavTabs() {
  const { viewAtual, setViewAtual, operadorAtivo, setRequisicaoSelecionada } = useApp();

  const handleTab = (id: ViewType) => {
    if (id === 'checklist') setRequisicaoSelecionada(null);
    setViewAtual(id);
  };

  return (
    <nav className="nav-tabs" role="navigation" aria-label="Navegação principal">
      {TABS.filter((t) => !t.apenasLider || operadorAtivo.papel === 'lider').map((tab) => (
        <button
          key={tab.id}
          id={`nav-tab-${tab.id}`}
          className={`nav-tab ${viewAtual === tab.id ? 'active' : ''}`}
          onClick={() => handleTab(tab.id)}
          aria-current={viewAtual === tab.id ? 'page' : undefined}
        >
          {tab.icon}
          <span className="nav-tab-text">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
