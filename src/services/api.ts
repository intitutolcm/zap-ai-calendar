import { Instance, User } from '../types';
import { supabase } from './supabase';

const EVO_URL = import.meta.env.VITE_EVO_API_URL || process.env.EVO_API_URL;
const EVO_KEY = import.meta.env.VITE_EVO_API_KEY || process.env.EVO_API_KEY;
const GLOBAL_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL;

const headers = {
  'apikey': EVO_KEY || '',
  'Content-Type': 'application/json'
};

// Função auxiliar para obter o ID da empresa de forma consistente
const getTargetId = (user: User) => user.company_id || user.id;

export const api = {
  users: {
    listProfiles: async (user: User) => {
      if (!user) return [];
      let query = supabase.from('users_profile').select('*');
      if (user.role === 'admin') {
        query = query.eq('role', 'company');
      } else {
        const companyId = getTargetId(user);
        query = query.eq('company_id', companyId);
      }
      const { data, error } = await query.order('name', { ascending: true });    
      if (error) {
        console.error("Erro ao listar perfis:", error);
        throw error;
      }
      return data;
    },
    upsert: async (userData: any) => {
      const { data, error } = await supabase.from('users_profile').upsert(userData).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id: string) => {
      const { error } = await supabase.from('users_profile').delete().eq('id', id);
      if (error) throw error;
    },
    register: async (userData: any) => {
      const { data, error } = await supabase.functions.invoke('create-user-admin', { body: userData });
      if (error) throw error;
      return data;
    }
  },

  templates: {
    listAll: async (user: User) => {
      const cid = getTargetId(user);
      const { data, error } = await supabase.from('prompt_templates').select('*').or(`company_id.eq.${cid},is_global.eq.true`).order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    save: async (template: any) => {
      const { data, error } = await supabase.from('prompt_templates').upsert(template).select().single();
      if (error) throw error;
      return data;
    }
  },

  instances: {
    list: async (user: User): Promise<Instance[]> => {
      const { data: dbInstances, error: dbError } = await supabase
        .from('instances')
        .select('id, name, token, company_id, agent_id')
        .eq('company_id', getTargetId(user));

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
        return dbInstances.map(inst => ({ ...inst, status: 'close' }));
      }
    },
    create: async (name: string, user: User) => {
      const companyId = getTargetId(user);
      const { data: settings } = await supabase.from('settings').select('webhook_url').eq('company_id', companyId).maybeSingle();
      const body = {
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        webhook: { url: GLOBAL_WEBHOOK_URL, byEvents: false, base64: true, events: ["MESSAGES_UPSERT"] }
      };
      const response = await fetch(`${EVO_URL}/instance/create`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('Erro na Evolution API');
      const evoData = await response.json();
      const { error } = await supabase.from('instances').insert({ name, token: evoData.hash || evoData.instance?.hash, company_id: companyId });
      if (error) throw error;
    },
    connect: async (instanceName: string) => {
      const res = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, { headers });
      const data = await res.json();
      return data.base64 || data.code || '';
    },
    logout: async (name: string) => fetch(`${EVO_URL}/instance/logout/${name}`, { method: 'DELETE', headers }),
    restart: async (name: string) => fetch(`${EVO_URL}/instance/restart/${name}`, { method: 'POST', headers }),
    delete: async (name: string) => {
      await fetch(`${EVO_URL}/instance/delete/${name}`, { method: 'DELETE', headers });
      await supabase.from('instances').delete().eq('name', name);
    },
    updateAgent: async (name: string, agentId: string | null) => {
      await supabase.from('instances').update({ agent_id: agentId || null }).eq('name', name);
    }
  },

  settings: {
    get: async (user: User) => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', getTargetId(user))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    save: async (user: User, updates: any) => {
      const { error } = await supabase.from('settings').upsert({
        company_id: getTargetId(user),
        business_hours_start: updates.businessHoursStart,
        business_hours_end: updates.businessHoursEnd,
        working_days: updates.workingDays, 
        address: updates.address,           
        website: updates.website,          
        instagram: updates.instagram,       
        offline_message: updates.offlineMessage,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id' });
      
      if (error) throw error;
    }
  },

  conversations: {
    list: async (user: User) => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, contacts!inner(*), instances!inner(*)')
        .eq('instances.company_id', getTargetId(user))
        .order('last_timestamp', { ascending: false });
      if (error) throw error;
      return data;
    },
    getUnreadCount: async (user: User) => {
      const { count, error } = await supabase
        .from('messages')
        .select('*, conversations!inner(instances!inner(company_id))', { count: 'exact', head: true })
        .eq('sender', 'USER').eq('is_read', false)
        .eq('conversations.instances.company_id', getTargetId(user));
      if (error) throw error;
      return count || 0;
    },
    markAsRead: async (conversationId: string) => {
      await supabase.from('messages').update({ is_read: true }).eq('conversation_id', conversationId).eq('sender', 'USER');
    },
    updateMode: async (id: string, isHuman: boolean) => {
      await supabase.from('conversations').update({ is_human_active: isHuman }).eq('id', id);
    }
  },

  messages: {
    list: async (conversationId: string) => {
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('timestamp', { ascending: true });
      if (error) throw error;
      return data;
    },
    send: async (instanceName: string, number: string, text: string, conversationId: string) => {
      const res = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, { method: 'POST', headers, body: JSON.stringify({ number, text }) });
      if (!res.ok) throw new Error('Erro ao enviar WhatsApp');
      await supabase.from('messages').insert({ conversation_id: conversationId, sender: 'OPERATOR', content: text });
    }
  },

  appointments: {
    list: async (user: User) => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, contacts!inner(company_id, name), services(name, price), professionals(name)')
        .eq('contacts.company_id', getTargetId(user))
        .order('appointment_date', { ascending: true });
      
      if (error) throw error;
      return (data || []).map(ap => ({
        id: ap.id,
        status: ap.status, 
        time: ap.appointment_time,
        date: ap.appointment_date,
        contactName: ap.contacts?.name,
        serviceName: ap.services?.name,
        professionalName: ap.professionals?.name,
        price: ap.services?.price || 0 
      }));
    },

    create: async (data: any, user: User) => {
      const { error } = await supabase.from('appointments').insert({
        contact_id: data.contactId,
        service_id: data.serviceId,
        professional_id: data.professionalId,
        appointment_date: data.date,
        appointment_time: data.time,
        company_id: getTargetId(user), // Injeção obrigatória para isolação
        status: 'PENDING'
      });
      if (error) throw error;
    },

    updateStatus: async (id: string, status: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    }
  },

  business: {
    services: {
      list: async (user: User) => {
        const { data, error } = await supabase.from('services').select('*').eq('company_id', getTargetId(user)).order('name', { ascending: true });
        if (error) throw error;
        return data;
      },
      upsert: async (data: any) => supabase.from('services').upsert(data)
    },
    professionals: {
      list: async (user: User) => {
        const { data, error } = await supabase.from('professionals').select('*').eq('company_id', getTargetId(user)).order('name', { ascending: true });
        if (error) throw error;
        return data;
      },
      upsert: async (data: any) => supabase.from('professionals').upsert(data)
    }
  },

  billing: {
    listInvoices: async (user: User) => {
      const { data, error } = await supabase.from('invoices').select('*, contacts!inner(company_id)').eq('contacts.company_id', getTargetId(user)).order('data_emissao', { ascending: false });
      if (error) throw error;
      return data;
    },
    getStats: async (user: User) => {
      const { data, error } = await supabase.from('invoices').select('valor, status_fatura, contacts!inner(company_id)').eq('contacts.company_id', getTargetId(user));
      if (error) throw error;
      const stats = { totalOpen: 0, totalReceived: 0, overdueCount: 0, pendingPix: 0 };
      data.forEach(inv => {
        if (inv.status_fatura === 'Aberta') stats.totalOpen += inv.valor;
        if (inv.status_fatura === 'Paga') stats.totalReceived += inv.valor;
        if (inv.status_fatura === 'Vencida') stats.overdueCount++;
      });
      return stats;
    },
    getPixCharge: async (faturaId: string) => {
    const { data, error } = await supabase
      .from('pix_charges')
      .select('*')
      .eq('invoice_id', faturaId)
      .maybeSingle();
    if (error) throw error;
    return data;
    },
  },

agents: {
    /**
     * Lista todos os agentes da empresa com seus respectivos vínculos
     */
    list: async (user: any) => {
      const { data, error } = await supabase
        .from('agents')
        .select(`
          *,
          agent_tools (
            tool_id
          )
        `)
        .eq('company_id', user.company_id || user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Mapeamento para CamelCase para manter o padrão do seu Frontend
      return data.map(a => ({
        id: a.id,
        name: a.name,
        prompt: a.prompt,
        enableAudio: a.enable_audio,
        enableImage: a.enable_image,
        isMultiAgent: a.is_multi_agent,
        parentAgentId: a.parent_agent_id,
        company_id: a.company_id,
        // Transforma a lista de objetos de ferramentas em um array simples de IDs
        selectedTools: a.agent_tools?.map((t: any) => t.tool_id) || []
      }));
    },

    /**
     * Salva ou Atualiza um Agente e gerencia suas flags de Multi-Agente
     */
    save: async (agent: any, user: any) => {
      const payload = {
        name: agent.name,
        prompt: agent.prompt,
        enable_audio: agent.enableAudio,
        enable_image: agent.enableImage,
        is_multi_agent: agent.isMultiAgent,
        // Se for principal, o pai deve ser nulo obrigatoriamente
        parent_agent_id: agent.isMultiAgent ? null : agent.parentAgentId,
        company_id: user.company_id || user.id
      };

      let result;

      if (agent.id) {
        // Update
        const { data, error } = await supabase
          .from('agents')
          .update(payload)
          .eq('id', agent.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('agents')
          .insert(payload)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }

      return result;
    },

    /**
     * Remove um agente (o banco cuidará de remover os vínculos em agent_tools via CASCADE)
     */
    delete: async (id: string) => {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    }
  },

  tools: {
    /**
     * Lista todas as ferramentas (functions) disponíveis no sistema
     */
    listAll: async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    }
  },

  helpers: {
    fetchFormDeps: async (user: User) => {
      const cid = getTargetId(user);
      const [c, s, p] = await Promise.all([
        supabase.from('contacts').select('id, name').eq('company_id', cid),
        supabase.from('services').select('id, name').eq('company_id', cid),
        supabase.from('professionals').select('id, name').eq('company_id', cid)
      ]);
      return { contacts: c.data || [], services: s.data || [], professionals: p.data || [] };
    }
  }
};