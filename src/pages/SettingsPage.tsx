import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';

interface SettingsPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

const WEEK_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const SettingsPage: React.FC<SettingsPageProps> = ({ showToast }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    workingDays: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    offlineMessage: '',
    fallback_message: '',
    address: '',
    website: '',
    instagram: '',
  });

  useEffect(() => {
    if (user) {
      api.settings.get(user).then(data => {
        if (data) {
          setFormData({
            businessHoursStart: data.business_hours_start?.slice(0, 5) || '09:00',
            businessHoursEnd: data.business_hours_end?.slice(0, 5) || '18:00',
            workingDays: data.working_days || ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
            offlineMessage: data.offline_message || '',
            fallback_message: data.fallback_message || '',
            address: data.address || '',
            website: data.website || '',
            instagram: data.instagram || '',
          });
        }
        setIsLoading(false);
      });
    }
  }, [user]);

  const handleConnectGoogle = () => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: import.meta.env.VITE_GOOGLE_REDIRECT_URI,
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    access_type: 'offline', // Importante para receber o Refresh Token
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ].join(' '),
    state: user?.id // Passamos o ID do usuário para saber quem está conectando no retorno
  };

  const qs = new URLSearchParams(options).toString();
  window.location.href = `${rootUrl}?${qs}`;
};

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await api.settings.save(user, formData);
      showToast('Configurações atualizadas!', 'success');
    } catch (error: any) {
      showToast(`Erro: ${error.message}`, 'error');
    }
  };

  const toggleDay = (day: string) => {
    const current = formData.workingDays;
    setFormData({
      ...formData,
      workingDays: current.includes(day) 
        ? current.filter(d => d !== day) 
        : [...current, day]
    });
  };

  if (isLoading) return (
    <div className="h-full flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-slate-50/30">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Configurações</h1>
          <p className="text-slate-500 mt-1">Gerencie as informações e o comportamento da sua empresa.</p>
        </header>

        <form onSubmit={handleSave} className="space-y-8 pb-20">
          
          {/* Sessão 1: Perfil da Empresa */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              Perfil Institucional
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Endereço Completo</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium transition-all" 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Site Oficial</label>
                  <input 
                    type="url" 
                    value={formData.website}
                    onChange={e => setFormData({...formData, website: e.target.value})}
                    placeholder="https://www.suaempresa.com.br"
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Instagram (Usuário)</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</span>
                    <input 
                      type="text" 
                      value={formData.instagram}
                      onChange={e => setFormData({...formData, instagram: e.target.value})}
                      placeholder="seu_perfil"
                      className="w-full pl-10 pr-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium transition-all" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sessão 2: Horário e Dias */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Disponibilidade de Atendimento
            </h3>
            
            <div className="mb-8">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-4 ml-1">Dias de Funcionamento</label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      formData.workingDays.includes(day) 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100' 
                        : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Horário de Abertura</label>
                <input 
                  type="time" 
                  value={formData.businessHoursStart}
                  onChange={e => setFormData({...formData, businessHoursStart: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Horário de Fechamento</label>
                <input 
                  type="time" 
                  value={formData.businessHoursEnd}
                  onChange={e => setFormData({...formData, businessHoursEnd: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" 
                />
              </div>
            </div>
          </div>

          {/* Seção Google Calendar */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm mt-8">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" className="w-5 h-5" alt="Google" />
                  Google Calendar
                </h3>
                <p className="text-xs text-slate-400 mt-1">Sincronize seus agendamentos com sua agenda pessoal.</p>
              </div>
              <button 
                type="button"
                onClick={handleConnectGoogle}
                className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-bold transition-all flex items-center gap-2"
              >
                Conectar Agenda
              </button>
            </div>
          </div>
          
          {/* Sessão 3: Automação */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Mensagens Automáticas
            </h3>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Mensagem de Ausência (Fora do Horário ou Dias Fechados)</label>
              <textarea 
                rows={4}
                value={formData.offlineMessage}
                onChange={e => setFormData({...formData, offlineMessage: e.target.value})}
                className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium resize-none text-sm" 
                placeholder="Olá! No momento estamos fora do nosso horário de atendimento..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white px-12 py-4 rounded-2xl font-bold shadow-xl active:scale-95 transition-all flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;