import React from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { User } from '../types';

interface LayoutProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ user, activeTab, setActiveTab, onLogout, children }) => {
  const titles: Record<string, string> = {
    dashboard: 'Instâncias WhatsApp',
    conversations: 'Central de Conversas',
    calendar: 'Agenda de Atendimentos',
    billing: 'Cobranças & Faturamento',
    business: 'Catálogo & Equipe',
    agents: 'Agentes de IA',
    settings: 'Configurações do Sistema'
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar recebendo o user para controle de permissões e badge de notificação */}
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={onLogout} 
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar exibe o título dinâmico baseado na aba ativa */}
        <Topbar user={user} title={titles[activeTab] || 'Painel de Controle'} />
        
        {/* Container principal com animação suave de entrada */}
        <main className="flex-1 overflow-hidden relative animate-in fade-in duration-500">
          {/* Nota: As páginas internas (como ConversationsPage) devem ter 
             h-full e seu próprio scroll para evitar barras duplas.
          */}
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;