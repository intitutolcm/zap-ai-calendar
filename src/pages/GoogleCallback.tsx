import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/services/supabase';
import { ToastType } from '@/components/Toast';

interface GoogleCallbackProps {
  showToast: (msg: string, type: ToastType) => void;
}

const GoogleCallback: React.FC<GoogleCallbackProps> = ({ showToast }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const calledRef = useRef(false); // Evita chamadas duplicadas no React Strict Mode

  useEffect(() => {
    const code = searchParams.get('code');
    const userId = searchParams.get('state');

    if (calledRef.current) return;

    if (code && userId) {
      calledRef.current = true;

      const finishAuth = async () => {
        try {
          // Chama a Edge Function que criamos no passo anterior
          const { data, error } = await supabase.functions.invoke('google-auth', {
            body: { code, userId }
          });

          if (error) throw error;

          showToast('Agenda Google conectada com sucesso!', 'success');
          navigate('/settings'); // Volta para configurações
        } catch (err: any) {
          console.error('Erro na autenticação Google:', err);
          showToast('Falha ao conectar com o Google.', 'error');
          navigate('/settings');
        }
      };

      finishAuth();
    }
  }, [searchParams, navigate, showToast]);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-white">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-slate-600 font-bold animate-pulse">Sincronizando com o Google Calendar...</p>
    </div>
  );
};

export default GoogleCallback;