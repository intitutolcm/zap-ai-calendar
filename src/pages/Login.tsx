
import React, { useState } from 'react';
import { User } from '../types';
import { ToastType } from '../components/Toast';
import { supabase } from '../services/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
  showToast: (msg: string, type: ToastType) => void;
}

const LoginPage: React.FC<LoginProps> = ({ onLogin, showToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    showToast(error.message, 'error');
  } else if (data.user) {
    // Agora aguardamos a busca do perfil completo no useAuth
    await onLogin({
      id: data.user.id,
      email: data.user.email || '',
      name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Usuário',
    });
  }
  setIsLoading(false);
};

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-12">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-6">Z</div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight text-center leading-tight">Plataforma ZapAI</h1>
            <p className="text-slate-400 mt-2 font-medium">Gestão inteligente de WhatsApp</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium"
                placeholder="nome@empresa.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 rounded-2xl text-white font-bold text-lg shadow-2xl shadow-indigo-600/30 transition-all ${
                isLoading 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97]'
              }`}
            >
              {isLoading ? 'Autenticando...' : 'Entrar no Dashboard'}
            </button>
          </form>
        </div>
      </div>
      <p className="mt-8 text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">ZapAI Pro v2.4.0</p>
    </div>
  );
};

export default LoginPage;
