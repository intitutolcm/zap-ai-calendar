import React from 'react';
import { User } from '../types';

interface TopbarProps {
  user: User;
  title: string;
}

const Topbar: React.FC<TopbarProps> = ({ user, title }) => {
  return (
    <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-10">
      {/* Título Dinâmico com animação leve ao trocar */}
      <h2 key={title} className="text-xl font-bold text-slate-900 tracking-tight animate-in slide-in-from-left-2 duration-300">
        {title}
      </h2>
      
      <div className="flex items-center gap-4">
        {/* Botão de Notificações Gerais */}
        <button className="p-2.5 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 rounded-xl transition-all relative group">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Ponto de notificação (pode ser ligado a um estado de alertas globais no futuro) */}
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white ring-1 ring-rose-500/20 group-hover:scale-110 transition-transform"></span>
        </button>
        
        {/* Separador Vertical */}
        <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
        
        {/* Perfil do Usuário */}
        <div className="flex items-center gap-4 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900 leading-tight">{user.name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user.role}</p>
          </div>
          
          <div className="relative">
            {/* Avatar com inicial e sombra suave */}
            <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-600/20 border-2 border-white overflow-hidden uppercase">
              {user.name.charAt(0)}
            </div>
            {/* Indicador de Status Online (Verde) */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm"></div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;