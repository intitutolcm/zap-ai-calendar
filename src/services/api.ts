import { Instance } from '../types';
import { supabase } from './supabase';

const EVO_URL = import.meta.env.VITE_EVO_API_URL || process.env.EVO_API_URL;
const EVO_KEY = import.meta.env.VITE_EVO_API_KEY || process.env.EVO_API_KEY;

const headers = {
  'apikey': EVO_KEY || '',
  'Content-Type': 'application/json'
};

export const api = {
  instances: {
    list: async (): Promise<Instance[]> => {
      const { data: dbInstances, error: dbError } = await supabase
        .from('instances')
        .select('id, name, token, company_id, agent_id');

      if (dbError) throw dbError;
      if (!dbInstances || dbInstances.length === 0) return [];

      try {
        const response = await fetch(`${EVO_URL}/instance/fetchInstances`, { headers });
        const evoArray = await response.json(); 

        return dbInstances.map(dbInst => {
          const evoInst = Array.isArray(evoArray) ? evoArray.find((e: any) => 
            e.name?.toLowerCase().trim() === dbInst.name?.toLowerCase().trim()
          ) : null;

          return {
            ...dbInst,
            status: evoInst?.connectionStatus || 'close',
            phoneNumber: evoInst?.ownerJid ? evoInst.ownerJid.split('@')[0] : 'Não vinculado',
            profilePicUrl: evoInst?.profilePicUrl || null
          };
        });
      } catch (error) {
        console.error("Erro Evolution API:", error);
        return dbInstances.map(inst => ({ ...inst, status: 'close' }));
      }
    },

    checkStatus: async (instanceName: string): Promise<boolean> => {
      try {
        const response = await fetch(`${EVO_URL}/instance/connectionState/${instanceName}`, { headers });
        const data = await response.json();
        return data.instance?.state === 'open' || data.instance?.status === 'open' || data.instance?.connectionStatus === 'open';
      } catch {
        return false;
      }
    },

    create: async (name: string, userId: string) => {
  // 1. Busca a URL de Webhook nas configurações da empresa
  const { data: settings } = await supabase
    .from('settings')
    .select('webhook_url')
    .eq('company_id', userId)
    .maybeSingle();

  const webhookUrl = settings?.webhook_url || "";

  // 2. Monta o Payload seguindo EXATAMENTE o seu modelo
  const body = {
    instanceName: name,
    integration: "WHATSAPP-BAILEYS",
    proxyHost: "",     // No futuro, você pode passar valores aqui
    proxyPort: "",
    proxyProtocol: "",
    proxyUsername: "",
    proxyPassword: "",
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: [
        "MESSAGES_UPSERT"
      ]
    }
  };

  // 3. Chamada ÚNICA para criação e configuração
  const response = await fetch(`${EVO_URL}/instance/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Erro ao criar instância na Evolution');
  }

  const evoData = await response.json();
  const hash = evoData.hash || evoData.instance?.hash;

  // 4. Salva no Supabase (já incluindo os novos campos de proxy se desejar)
  const { error } = await supabase.from('instances').insert({
    name: name,
    token: hash,
    company_id: userId,
    proxy_host: body.proxyHost,
    proxy_port: body.proxyPort,
    proxy_protocol: body.proxyProtocol,
    proxy_username: body.proxyUsername,
    proxy_password: body.proxyPassword
  });

  if (error) throw error;
},

    connect: async (instanceName: string): Promise<string> => {
      const response = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, { headers });
      const data = await response.json();
      if (data.error || data.message) throw new Error(data.message || 'Erro no QR Code');
      return data.base64 || data.code || ''; 
    },

    logout: async (instanceName: string) => {
      await fetch(`${EVO_URL}/instance/logout/${instanceName}`, { method: 'DELETE', headers });
    },

    restart: async (name: string) => {
      await fetch(`${EVO_URL}/instance/restart/${name}`, { method: 'POST', headers });
    },

    delete: async (name: string) => {
      await fetch(`${EVO_URL}/instance/delete/${name}`, { method: 'DELETE', headers });
      await supabase.from('instances').delete().eq('name', name);
    },

    updateAgent: async (instanceName: string, agentId: string | null) => {
      const { error } = await supabase
        .from('instances')
        .update({ 
          agent_id: agentId === "" ? null : agentId 
        })
        .eq('name', instanceName);

      if (error) throw error;
    },

  },

  settings: {
    get: async (companyId: string) => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },

    save: async (companyId: string, updates: any) => {
      const { error } = await supabase
        .from('settings')
        .upsert({
          company_id: companyId,
          business_hours_start: updates.businessHoursStart,
          business_hours_end: updates.businessHoursEnd,
          offline_message: updates.offlineMessage,
          fallback_message: updates.fallback_message,
          webhook_url: updates.webhookUrl,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'company_id' 
        });

      if (error) throw error;
    }
  },
  
  conversations: {
    list: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contacts (name, phone),
          instances (name) 
        `)
        .order('last_timestamp', { ascending: false });

      if (error) throw error;

      // Retornamos os dados diretamente para o componente
      return data;
    },

    updateMode: async (id: string, isHuman: boolean) => {
      const { error } = await supabase
        .from('conversations')
        .update({ is_human_active: isHuman })
        .eq('id', id);
      if (error) throw error;
    },

    getUnreadCount: async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender', 'USER')
        .eq('is_read', false);
      if (error) throw error;
      return count || 0;
    },

    markAsRead: async (conversationId: string) => {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('sender', 'USER');
      if (error) throw error;
    }
  },

  messages: {
    list: async (conversationId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data;
    },

    send: async (instanceName: string, number: string, text: string, conversationId: string) => {
      const response = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number, text })
      });
      if (!response.ok) throw new Error('Erro ao enviar via WhatsApp');

      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'OPERATOR',
        content: text
      });
      if (error) throw error;
    }
  },

  appointments: {
    list: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, status, appointment_date, appointment_time, contacts (name), services (name), professionals (name)')
        .order('appointment_date', { ascending: true });
      if (error) throw error;
      return (data || []).map(ap => ({
        id: ap.id,
        status: ap.status, 
        time: ap.appointment_time,
        date: ap.appointment_date,
        contactName: ap.contacts?.name || 'Cliente sem nome',
        serviceName: ap.services?.name || 'Serviço geral',
        professionalName: ap.professionals?.name || 'Profissional'
      }));
    },

    create: async (data: any) => {
      const { error } = await supabase.from('appointments').insert({
        contact_id: data.contactId,
        service_id: data.serviceId,
        professional_id: data.professionalId,
        appointment_date: data.date,
        appointment_time: data.time,
        status: 'PENDING'
      });
      if (error) throw error;
    },

    updateStatus: async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) throw error;
    }
  },

  business: {
  services: {
    list: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    // O upsert substitui o create e o update ao mesmo tempo
    upsert: async (data: any) => {
      const { error } = await supabase.from('services').upsert(data);
      if (error) throw error;
    },
    delete: async (id: string) => {
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
    },
  },
  professionals: {
    list: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    upsert: async (data: any) => {
      const { error } = await supabase.from('professionals').upsert(data);
      if (error) throw error;
    },
    delete: async (id: string) => {
      const { error } = await supabase.from('professionals').delete().eq('id', id);
      if (error) throw error;
    },
  }
},

  billing: {
    listInvoices: async () => {
      const { data, error } = await supabase.from('invoices').select('*').order('data_emissao', { ascending: false });
      if (error) throw error;
      return data;
    },
    getPixCharge: async (faturaId: string) => {
      const { data, error } = await supabase.from('pix_charges').select('*').eq('fatura_id', faturaId).maybeSingle();
      if (error) throw error;
      return data;
    },
    getStats: async () => {
      const { data, error } = await supabase.from('invoices').select('valor, status_fatura');
      if (error) throw error;
      const stats = { totalOpen: 0, totalReceived: 0, overdueCount: 0, pendingPix: 0 };
      data.forEach(inv => {
        if (inv.status_fatura === 'Aberta') stats.totalOpen += inv.valor;
        if (inv.status_fatura === 'Paga') stats.totalReceived += inv.valor;
        if (inv.status_fatura === 'Vencida') stats.overdueCount++;
      });
      return stats;
    }
  },
  
    agents: {
    list: async (userId: string) => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('company_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data.map(a => ({
        id: a.id,
        name: a.name,
        prompt: a.prompt,
        enableAudio: a.enable_audio,
        enableImage: a.enable_image,
        isMultiAgent: a.is_multi_agent,
        company_id: a.company_id
      }));
    },
    
    save: async (agent: any, userId: string) => {
      const payload = {
        name: agent.name,
        prompt: agent.prompt,
        enable_audio: agent.enableAudio,
        enable_image: agent.enableImage,
        is_multi_agent: agent.isMultiAgent,
        company_id: userId
      };

      if (agent.id) {
        const { data, error } = await supabase
          .from('agents')
          .update(payload)
          .eq('id', agent.id)
          .select()
          .single();
        if (error) throw error;
        return data; // Retorna o agente atualizado
      } else {
        const { data, error } = await supabase
          .from('agents')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data; // Retorna o agente novo com ID gerado
      }
    },

    delete: async (id: string) => {
      const { error } = await supabase.from('agents').delete().eq('id', id);
      if (error) throw error;
    }
  },

  helpers: {
    fetchFormDeps: async () => {
      const [contacts, services, professionals] = await Promise.all([
        supabase.from('contacts').select('id, name'),
        supabase.from('services').select('id, name'),
        supabase.from('professionals').select('id, name')
      ]);
      return { 
        contacts: contacts.data || [], 
        services: services.data || [], 
        professionals: professionals.data || [] 
      };
    }
  }
};