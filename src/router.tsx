import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Layout from "./lib/layout";
import LoginPage from '@/pages/Login';
import InstancesPage from '@/pages/Instances';
import ConversationsPage from '@/pages/Conversations';
import CalendarPage from '@/pages/Calendar';
import BusinessPage from '@/pages/Business';
import BillingPage from "@/pages/Billing";
import AgentsPage from "@/pages/AgentsPage";
import SettingsPage from "@/pages/SettingsPage";
import { UserRole } from '@/types';
import { ToastType } from '@/components/Toast';

// Interface para receber o showToast do App.tsx
interface RoutesProps {
  showToast: (msg: string, type: ToastType) => void;
}

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['dashboard', 'conversations', 'calendar', 'billing', 'business', 'agents', 'settings'],
  company: ['dashboard', 'conversations', 'calendar', 'billing', 'business', 'agents', 'settings'],
  profissional: ['conversations', 'calendar', 'business'],
  operador: ['conversations']
};

const Routes: React.FC<RoutesProps> = ({ showToast }) => {
  const { user, loading, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Redirecionamento de segurança por Role
  useEffect(() => {
    if (user) {
      const allowedTabs = ROLE_PERMISSIONS[user.role] || [];
      if (!allowedTabs.includes(activeTab)) {
        setActiveTab(allowedTabs[0] || 'conversations');
      }
    }
  }, [user, activeTab]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={login} showToast={showToast} />;
  }

  const renderContent = () => {
    const allowedTabs = ROLE_PERMISSIONS[user.role] || [];

    if (!allowedTabs.includes(activeTab)) {
      return <div className="flex items-center justify-center h-full text-slate-400">Acesso restrito.</div>;
    }

    switch (activeTab) {
      case 'dashboard': return <InstancesPage showToast={showToast} />;
      case 'conversations': return <ConversationsPage showToast={showToast} />;
      case 'calendar': return <CalendarPage showToast={showToast} />;
      case 'billing': return <BillingPage showToast={showToast} />;
      case 'business': return <BusinessPage showToast={showToast} />;
      case 'agents': return <AgentsPage showToast={showToast} />;
      case 'settings': return <SettingsPage showToast={showToast} />;
      default: return <InstancesPage showToast={showToast} />;
    }
  };

  return (
    <Layout 
      user={user} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onLogout={logout}
    >
      {renderContent()}
    </Layout>
  );
};

export default Routes;