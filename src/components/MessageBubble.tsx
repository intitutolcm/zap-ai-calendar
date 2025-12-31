import React from 'react';

interface MessageBubbleProps {
  message: {
    content: string;
    isMine: boolean;
    senderType: 'USER' | 'AI' | 'OPERATOR' | 'SYSTEM';
    timestamp: string;
  };
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isMine = message.isMine;

  // Lógica para detectar e formatar mídias transcritas
  const isAudio = message.content?.startsWith('[Transcrição de Áudio]');
  const isImage = message.content?.startsWith('[Análise de Imagem]');
  
  // Limpa o prefixo para mostrar apenas o texto útil
  const cleanContent = message.content
    ?.replace('[Transcrição de Áudio]: ', '')
    ?.replace('[Análise de Imagem]: ', '');

  return (
    <div className={`flex w-full mb-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-sm transition-all ${
        isMine 
          ? 'bg-indigo-600 text-white rounded-tr-none' 
          : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
      }`}>
        
        {/* Cabeçalho do Balão */}
        <div className={`text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1.5 opacity-60 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span>
            {message.senderType === 'AI' ? 'Assistente IA' : 
             message.senderType === 'OPERATOR' ? 'Você (Operador)' : 'Lead'}
          </span>
        </div>

        {/* Corpo da Mensagem com Detecção de Mídia */}
        <div className="flex flex-col gap-1">
          {(isAudio || isImage) && (
            <div className={`flex items-center gap-2 mb-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${
              isMine ? 'bg-white/10 text-indigo-100' : 'bg-slate-100 text-slate-400'
            }`}>
              {isAudio ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                  Áudio Transcrito
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                  Visão Computacional
                </>
              )}
            </div>
          )}
          
          <p className={`text-sm leading-relaxed ${isAudio ? 'italic' : ''}`}>
            {cleanContent}
          </p>
        </div>

        {/* Rodapé: Timestamp */}
        <div className={`text-[9px] mt-2 font-medium opacity-40 ${isMine ? 'text-left' : 'text-right'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;