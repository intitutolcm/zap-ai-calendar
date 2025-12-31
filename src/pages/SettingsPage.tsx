import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';

interface SettingsPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ showToast }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    offlineMessage: '',
    fallback_message: '',
    webhookUrl: ''
  });

  useEffect(() => {
    if (user) {
      api.settings.get(user.id).then(data => {
        if (data) {
          setFormData({
            businessHoursStart: data.business_hours_start?.slice(0, 5) || '09:00',
            businessHoursEnd: data.business_hours_end?.slice(0, 5) || '18:00',
            offlineMessage: data.offline_message || '',
            fallback_message: data.fallback_message || '',
            webhookUrl: data.webhook_url || ''
          });
        }
        setIsLoading(false);
      });
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;

  try {
    await api.settings.save(user.id, formData);
    showToast('Configurações salvas com sucesso!', 'success');
  } catch (error: any) {
    // Exibe a mensagem real do erro vinda do Supabase
    console.error("Erro ao salvar:", error);
    showToast(`Erro: ${error.message || 'Falha ao salvar no banco'}`, 'error');
  }
};

  if (isLoading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Configurações</h1>
        <p className="text-slate-500 mb-10">Gerencie o comportamento global do seu atendimento inteligente.</p>

        <form onSubmit={handleSave} className="space-y-8">
          {/* Sessão: Horário de Funcionamento */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Horário de Atendimento
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Início</label>
                <input 
                  type="time" 
                  value={formData.businessHoursStart}
                  onChange={e => setFormData({...formData, businessHoursStart: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Término</label>
                <input 
                  type="time" 
                  value={formData.businessHoursEnd}
                  onChange={e => setFormData({...formData, businessHoursEnd: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" 
                />
              </div>
            </div>
          </div>

          {/* Sessão: Automação */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Mensagens Automáticas
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Mensagem de Ausência (Fora do Horário)</label>
                <textarea 
                  rows={3}
                  value={formData.offlineMessage}
                  onChange={e => setFormData({...formData, offlineMessage: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium resize-none" 
                  placeholder="Olá! No momento não estamos atendendo..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">URL de Webhook (Global)</label>
                <input 
                  type="url"
                  value={formData.webhookUrl}
                  onChange={e => setFormData({...formData, webhookUrl: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" 
                  placeholder="https://seu-projeto.supabase.co/functions/v1/whatsapp-webhook"
                />
                <p className="mt-2 text-[10px] text-slate-400 italic">Esta URL será configurada automaticamente em todas as novas instâncias.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all">
              Salvar Configurações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;