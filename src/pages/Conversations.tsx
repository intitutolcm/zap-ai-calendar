import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';
import MessageBubble from '@/components/MessageBubble';

interface ConversationsProps {
  showToast: (msg: string, type: ToastType) => void;
}

const ConversationsPage: React.FC<ConversationsProps> = ({ showToast }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true); // NOVO: Estado de loading
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      const data = await api.conversations.list(user);
      console.log("Conversas carregadas da API:", data);
      console.log("Meu ID de usuário:", user?.id);
      console.log("Meu Company ID:", user?.company_id);
      console.log("O que estou usando como filtro (CID):", user?.company_id || user?.id);
      setConversations(data || []);
      
      if (selectedChat) {
        const updated = data.find((c: any) => c.id === selectedChat.id);
        if (updated) setSelectedChat(updated);
      }
    } catch (error) {
      console.error("Erro conversas:", error);
      showToast('Erro ao carregar conversas', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      const data = await api.messages.list(id);
      setMessages(data);
    } catch (error) {
      showToast('Erro ao carregar histórico', 'error');
    }
  };

  useEffect(() => {
    if (user) {
      loadConversations();

      const channel = supabase
        .channel('chat_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          if (selectedChat && (payload.new as any).conversation_id === selectedChat.id) {
            loadMessages(selectedChat.id);
          }
          loadConversations();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
          loadConversations();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [user, selectedChat?.id]);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id);
      api.conversations.markAsRead(selectedChat.id);
    }
  }, [selectedChat?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const instanceName = selectedChat.instances?.name;
    if (!instanceName) {
      showToast('Instância não encontrada.', 'error');
      return;
    }

    try {
      await api.messages.send(instanceName, selectedChat.contacts.phone, newMessage, selectedChat.id);
      setNewMessage('');
    } catch (error: any) {
      showToast('Erro ao enviar mensagem.', 'error');
    }
  };

  const toggleAIStatus = async (activateHuman: boolean) => {
    if (!selectedChat) return;
    try {
      await api.conversations.updateMode(selectedChat.id, activateHuman);
      const msg = activateHuman ? 'IA pausada. Você assumiu.' : 'IA reativada com sucesso!';
      showToast(msg, activateHuman ? 'info' : 'success');
      loadConversations();
    } catch (error) {
      showToast('Erro ao alterar status do chat.', 'error');
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar Lateral */}
      <div className="w-80 sm:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900">Conversas</h2>
          {isLoading && <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>}
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {!isLoading && conversations.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">Nenhuma conversa encontrada</div>
          )}
          
          {conversations.map(chatItem => (
            <button
              key={chatItem.id}
              onClick={() => setSelectedChat(chatItem)}
              className={`w-full p-4 rounded-[1.5rem] flex items-center gap-4 transition-all ${
                selectedChat?.id === chatItem.id ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'
              }`}
            >
               {/* Identidade Visual */}
               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                selectedChat?.id === chatItem.id ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {chatItem.contacts?.name?.charAt(0) || '?'}
              </div>

              <div className="flex-1 text-left min-w-0">
                <div className="flex justify-between items-start">
                  <span className="font-bold truncate text-sm block">
                    {chatItem.contacts?.name || chatItem.contacts?.phone}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                    selectedChat?.id === chatItem.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {chatItem.instances?.name || 'S/ Instância'}
                  </span>
                </div>
                <p className={`text-xs truncate font-medium ${selectedChat?.id === chatItem.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {chatItem.last_message || 'Inicie a conversa...'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Janela de Chat */}
      <div className="flex-1 flex flex-col bg-slate-50/50">
        {selectedChat ? (
          <>
            <div className="p-5 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center font-bold text-indigo-600">
                  {selectedChat.contacts?.name?.charAt(0) || '?'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 leading-none mb-1.5">{selectedChat.contacts?.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {selectedChat.is_human_active ? '● Atendimento Humano' : '● IA Ativa'}
                    </span>
                    
                    {/* IDENTIFICAÇÃO DA INSTÂNCIA NO CABEÇALHO */}
                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                      Via: {selectedChat.instances?.name}
                    </span>
                  </div>
                </div>
              </div>
              
              {selectedChat.is_human_active ? (
                <button 
                  onClick={() => toggleAIStatus(false)} 
                  className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-200 transition-all"
                >
                  Reativar IA
                </button>
              ) : (
                <button 
                  onClick={() => toggleAIStatus(true)} 
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Assumir Chat
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar">
              {messages.map(m => (
                <MessageBubble 
                  key={m.id} 
                  message={{
                    ...m,
                    isMine: m.sender === 'AI' || m.sender === 'OPERATOR',
                    senderType: m.sender 
                  }} 
                />
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-white border-t border-slate-200">
              <form onSubmit={handleSend} className="flex items-center gap-3">
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  className="flex-1 bg-slate-50 px-6 py-4 rounded-2xl text-sm outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all font-medium"
                  placeholder={selectedChat.is_human_active ? "Responda como humano..." : "IA está respondendo... (Assuma para digitar)"}
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim()} 
                  className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg"
                >
                  <svg className="w-6 h-6 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-400 font-bold">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsPage;