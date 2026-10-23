// src/App.tsx
// Componente raiz - roteamento de views e layout principal

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { NavTabs } from './components/NavTabs';
import { ToastContainer } from './components/ToastContainer';
import { PainelGeral } from './views/PainelGeral';
import { ChecklistSeparacao } from './views/ChecklistSeparacao';
import { CriarRequisicao } from './views/CriarRequisicao';
import { Metricas } from './views/Metricas';
import { Configuracoes } from './views/Configuracoes';
import { AlertTriangle, Warehouse } from 'lucide-react';

// Tela de erro quando Firebase não está configurado
function TelaErroFirebase({ erro }: { erro: string }) {
  return (
    <div className="loading-screen" style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{
        background: 'var(--clr-surface)',
        border: '1px solid var(--clr-amber)',
        borderRadius: 'var(--radius-xl)',
        padding: '2.5rem',
        maxWidth: '520px',
        width: '100%',
      }}>
        <AlertTriangle size={48} color="var(--clr-amber)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '.75rem' }}>
          Firebase Não Configurado
        </h2>
        <p style={{ color: 'var(--clr-muted)', fontSize: '.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          O banco de dados ainda não foi conectado. Para usar o WMS, você precisa configurar as credenciais do Firebase.
        </p>
        <div style={{
          background: 'var(--clr-bg)',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius)',
          padding: '1rem',
          textAlign: 'left',
          marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: '.75rem', color: 'var(--clr-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
            1. Crie um projeto em <strong style={{ color: 'var(--clr-sky)' }}>console.firebase.google.com</strong><br/>
            2. Ative <strong>Authentication → Anônimo</strong><br/>
            3. Crie o <strong>Firestore Database</strong><br/>
            4. Copie <code style={{ color: 'var(--clr-emerald)' }}>.env.example</code> para <code style={{ color: 'var(--clr-emerald)' }}>.env</code><br/>
            5. Cole suas credenciais no <code style={{ color: 'var(--clr-emerald)' }}>.env</code><br/>
            6. Reinicie com <code style={{ color: 'var(--clr-emerald)' }}>npm run dev</code>
          </p>
        </div>
        <details style={{ textAlign: 'left' }}>
          <summary style={{ fontSize: '.75rem', color: 'var(--clr-muted)', cursor: 'pointer', marginBottom: '.5rem' }}>
            Detalhes do erro técnico
          </summary>
          <code style={{ fontSize: '.7rem', color: 'var(--clr-rose)', display: 'block', wordBreak: 'break-all' }}>
            {erro}
          </code>
        </details>
      </div>
    </div>
  );
}

function AppContent() {
  const { viewAtual, carregando, erroConexao, conectado } = useApp();

  // Mostra erro se Firebase falhou
  if (erroConexao) {
    return <TelaErroFirebase erro={erroConexao} />;
  }

  const renderView = () => {
    switch (viewAtual) {
      case 'painel':    return <PainelGeral />;
      case 'checklist': return <ChecklistSeparacao />;
      case 'criar':     return <CriarRequisicao />;
      case 'metricas':      return <Metricas />;
      case 'configuracoes': return <Configuracoes />;
      default:              return <PainelGeral />;
    }
  };

  return (
    <div className="app-layout">
      <Header />
      <NavTabs />
      {renderView()}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
