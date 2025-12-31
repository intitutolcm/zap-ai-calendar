import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { api } from '@/services/api';

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const fetchCount = async () => {
    const total = await api.conversations.getUnreadCount();
    setCount(total);
  };

  useEffect(() => {
    fetchCount();

    // Ouve novas mensagens para incrementar o contador
    const channel = supabase
      .channel('unread-count')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'messages' }, 
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}