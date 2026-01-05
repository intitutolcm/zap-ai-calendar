// src/services/api.ts
import { Instance, User } from '../types';
import { supabase } from './supabase';

/* =====================================================
 * ENV
 * ===================================================== */
const EVO_URL =
  import.meta.env.VITE_EVO_API_URL || process.env.EVO_API_URL;

const EVO_KEY =
  import.meta.env.VITE_EVO_API_KEY || process.env.EVO_API_KEY;

const GLOBAL_WEBHOOK_URL =
  import.meta.env.VITE_WEBHOOK_URL_WHATSAPP;

const GERAR_FATURA_WEBHOOK_URL =
  import.meta.env.VITE_WEBHOOK_URL_GERAR_FATURA;

const CHECK_PAGAMENTO_WEBHOOK_URL =
  import.meta.env.VITE_WEBHOOK_URL_CHECK_PAGAMENTO;

const headers = {
  apikey: EVO_KEY || '',
  'Content-Type': 'application/json',
};

/* =====================================================
 * HELPERS
 * ===================================================== */

/**
 * Retorna o ID raiz da empresa
 */
const getTargetId = (user: User) => user.company_id || user.id;

/**
 * Dispara mensagem via WhatsApp
 * e registra no histórico da conversa
 */
async function dispatchWA(appointment: any, message: string) {
  const { data: inst } = await supabase
    .from('instances')
    .select('name, token')
    .eq('company_id', appointment.company_id)
    .limit(1)
    .single();

  if (!inst) {
    throw new Error('Nenhuma instância conectada para esta empresa.');
  }

  await fetch(`${EVO_URL}/message/sendText/${inst.name}`, {
    method: 'POST',
    headers: {
      apikey: inst.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: appointment.contacts.phone,
      text: message,
    }),
  });

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', appointment.contact_id)
    .maybeSingle();

  if (conv) {
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender: 'AI',
      content: message,
    });
  }
}

/* =====================================================
 * API
 * ===================================================== */

export const api = {
  /* ================= USERS ================= */
  users: {
    listProfiles: async (user: User) => {
      if (!user?.id) return [];

      let query = supabase.from('users_profile').select('*');

      if (user.role === 'admin') {
        query = query.eq('role', 'company');
      } else {
        query = query.eq('company_id', user.id);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;

      return data;
    },

    upsert: async (userData: any) => {
      const { data, error } = await supabase
        .from('users_profile')
        .upsert(userData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    delete: async (id: string) => {
      const { error } = await supabase
        .from('users_profile')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    register: async (userData: any) => {
      const { data, error } = await supabase.functions.invoke(
        'create-user-admin',
        { body: userData }
      );

      if (error) throw error;
      return data;
    },
  },

  /* ================= TEMPLATES ================= */
  templates: {
    listAll: async (user: User) => {
      const cid = getTargetId(user);

      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .or(`company_id.eq.${cid},is_global.eq.true`)
        .order('name');

      if (error) throw error;
      return data;
    },

    save: async (template: any) => {
      const { data, error } = await supabase
        .from('prompt_templates')
        .upsert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  },

  /* ================= INSTANCES ================= */
  instances: {
    list: async (user: User): Promise<Instance[]> => {
      const { data: dbInstances, error } = await supabase
        .from('instances')
        .select('id, name, token, company_id, agent_id')
        .eq('company_id', getTargetId(user));

      if (error) throw error;
      if (!dbInstances?.length) return [];

      try {
        const response = await fetch(
          `${EVO_URL}/instance/fetchInstances`,
          { headers }
        );
        const evoArray = await response.json();

        return dbInstances.map((dbInst) => {
          const evoInst = Array.isArray(evoArray)
            ? evoArray.find(
                (e: any) =>
                  e.name?.toLowerCase().trim() ===
                  dbInst.name?.toLowerCase().trim()
              )
            : null;

          return {
            ...dbInst,
            status: evoInst?.connectionStatus || 'close',
            phoneNumber: evoInst?.ownerJid
              ? evoInst.ownerJid.split('@')[0]
              : 'Não vinculado',
            profilePicUrl: evoInst?.profilePicUrl || null,
          };
        });
      } catch {
        return dbInstances.map((i) => ({ ...i, status: 'close' }));
      }
    },

    create: async (name: string, user: User) => {
      const companyId = getTargetId(user);

      const body = {
        instanceName: name,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: GLOBAL_WEBHOOK_URL,
          byEvents: false,
          base64: true,
          events: ['MESSAGES_UPSERT'],
        },
      };

      const response = await fetch(`${EVO_URL}/instance/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Erro na Evolution API');
      }

      const evoData = await response.json();

      const { error } = await supabase.from('instances').insert({
        name,
        token: evoData.hash || evoData.instance?.hash,
        company_id: companyId,
      });

      if (error) throw error;
    },

    connect: async (instanceName: string) => {
      const res = await fetch(
        `${EVO_URL}/instance/connect/${instanceName}`,
        { headers }
      );
      const data = await res.json();
      return data.base64 || data.code || '';
    },

    logout: async (name: string) =>
      fetch(`${EVO_URL}/instance/logout/${name}`, {
        method: 'DELETE',
        headers,
      }),

    restart: async (name: string) =>
      fetch(`${EVO_URL}/instance/restart/${name}`, {
        method: 'POST',
        headers,
      }),

    delete: async (name: string) => {
      await fetch(`${EVO_URL}/instance/delete/${name}`, {
        method: 'DELETE',
        headers,
      });

      await supabase.from('instances').delete().eq('name', name);
    },

    checkStatus: async (instanceName: string) => {
      try {
        const response = await fetch(
          `${EVO_URL}/instance/connectionState/${instanceName}`,
          { headers }
        );
        if (!response.ok) return 'close';
        const data = await response.json();
        return data.instance?.state || 'close';
      } catch {
        return 'close';
      }
    },

    updateAgent: async (name: string, agentId: string | null) => {
      await supabase
        .from('instances')
        .update({ agent_id: agentId })
        .eq('name', name);
    },
  },

  /* ================= CONVERSATIONS ================= */
  conversations: {
    list: async (user: User) => {
      let query = supabase
        .from('conversations')
        .select(`*, contacts!inner(*), instances!inner(*)`)
        .order('last_timestamp', { ascending: false });

      if (user.role !== 'admin') {
        query = query.eq(
          'instances.company_id',
          getTargetId(user)
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    markAsRead: async (conversationId: string) => {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('sender', 'USER');
    },

    updateMode: async (id: string, isHuman: boolean) => {
      await supabase
        .from('conversations')
        .update({ is_human_active: isHuman })
        .eq('id', id);
    },

    getUnreadCount: async (user: User) => {
      const { count, error } = await supabase
        .from('messages')
        .select(
          '*, conversations!inner(instances!inner(company_id))',
          { count: 'exact', head: true }
        )
        .eq('sender', 'USER')
        .eq('is_read', false)
        .eq(
          'conversations.instances.company_id',
          getTargetId(user)
        );

      if (error) throw error;
      return count || 0;
    },
  },

  /* ================= MESSAGES ================= */
  messages: {
    list: async (conversationId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp');

      if (error) throw error;
      return data;
    },

    send: async (
      instanceName: string,
      number: string,
      text: string,
      conversationId: string
    ) => {
      const res = await fetch(
        `${EVO_URL}/message/sendText/${instanceName}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ number, text }),
        }
      );

      if (!res.ok) {
        throw new Error('Erro ao enviar WhatsApp');
      }

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'OPERATOR',
        content: text,
      });
    },
  },

  /* ================= APPOINTMENTS ================= */
  appointments: {
    list: async (user: User) => {
      const cid = getTargetId(user);

      const { data, error } = await supabase
        .from('appointments')
        .select(
          '*, contacts(id,name,cpf), services(id,name,price), professionals(id,name)'
        )
        .eq('company_id', cid)
        .order('appointment_date');

      if (error) throw error;

      return (data || []).map((ap) => ({
        ...ap,
        contactId: ap.contact_id,
        serviceId: ap.service_id,
        professionalId: ap.professional_id,
        date: ap.appointment_date,
        time: ap.appointment_time,
        contactName: ap.contacts?.name || 'Cliente sem nome',
        contactCpf: ap.contacts?.cpf || '',
        serviceName: ap.services?.name || 'Serviço',
        professionalName:
          ap.professionals?.name || 'Profissional',
        price: ap.services?.price || 0,
      }));
    },

    create: async (data: any, user: User) => {
      const { error } = await supabase
        .from('appointments')
        .insert({
          contact_id: data.contactId,
          service_id: data.serviceId,
          professional_id: data.professionalId,
          appointment_date: data.date,
          appointment_time: data.time,
          company_id: getTargetId(user),
          status: 'PENDING',
        });

      if (error) throw error;
    },

    delete: async (id: string) => {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    updateStatus: async (id: string, status: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },

    sendConfirmation: async (appointmentId: string) => {
      const { data: apt } = await supabase
        .from('appointments')
        .select(
          `contact_id, appointment_date, appointment_time, company_id,
           contacts(phone, name), services(name)`
        )
        .eq('id', appointmentId)
        .single();

      if (!apt) return;

      const dateStr = new Date(
        `${apt.appointment_date}T00:00:00`
      ).toLocaleDateString('pt-BR');

      const msg = `Olá *${apt.contacts.name}*! Seu agendamento para *${apt.services.name}* no dia *${dateStr}* às *${apt.appointment_time.substring(
        0,
        5
      )}* foi *CONFIRMADO*! ✅`;

      await dispatchWA(apt, msg);
    },

    sendManualReminder: async (appointmentId: string) => {
      const { data: apt } = await supabase
        .from('appointments')
        .select(
          `contact_id, appointment_date, appointment_time, company_id,
           contacts(phone, name), services(name)`
        )
        .eq('id', appointmentId)
        .single();

      if (!apt) return;

      const dateStr = new Date(
        `${apt.appointment_date}T00:00:00`
      ).toLocaleDateString('pt-BR');

      const msg = `Oi *${apt.contacts.name}*, tudo bem? 🔔 Passando para te lembrar do seu agendamento de *${apt.services.name}* para o dia *${dateStr}* às *${apt.appointment_time.substring(
        0,
        5
      )}*.\n\nPodemos confirmar sua presença?`;

      await dispatchWA(apt, msg);
    },
  },

  /* ================= BUSINESS ================= */
  business: {
    services: {
      list: async (user: User) => {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('company_id', getTargetId(user))
          .order('name');

        if (error) throw error;
        return data;
      },

      upsert: async (data: any) =>
        supabase.from('services').upsert(data),
    },

    professionals: {
      list: async (user: User) => {
        const { data, error } = await supabase
          .from('professionals')
          .select('*')
          .eq('company_id', getTargetId(user))
          .order('name');

        if (error) throw error;
        return data;
      },

      upsert: async (data: any) =>
        supabase.from('professionals').upsert(data),
    },
  },

  /* ================= AGENTS ================= */
  agents: {
    list: async (user: User) => {
      const { data, error } = await supabase
        .from('agents')
        .select('*, agent_tools ( tool_id )')
        .eq('company_id', getTargetId(user))
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map((a: any) => ({
        ...a,
        selectedTools:
          a.agent_tools?.map((t: any) => t.tool_id) || [],
      }));
    },

    save: async (agent: any, user: User) => {
      const payload = {
        name: agent.name,
        prompt: agent.prompt,
        enable_audio: agent.enableAudio,
        enable_image: agent.enableImage,
        is_multi_agent: agent.isMultiAgent,
        parent_agent_id: agent.isMultiAgent
          ? null
          : agent.parentAgentId,
        company_id: getTargetId(user),
      };

      const query = agent.id
        ? supabase.from('agents').update(payload).eq('id', agent.id)
        : supabase.from('agents').insert(payload);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
  },

  /* ================= BILLING ================= */
  billing: {
    listInvoices: async (user: User) => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, contacts(name)')
        .eq('company_id', getTargetId(user))
        .order('data_emissao', { ascending: false });

      if (error) throw error;
      return data;
    },

    getStats: async (user: User) => {
      const { data, error } = await supabase
        .from('invoices')
        .select('valor, status_fatura')
        .eq('company_id', getTargetId(user));

      if (error) throw error;

      const stats = {
        totalOpen: 0,
        totalReceived: 0,
        overdueCount: 0,
      };

      data.forEach((inv) => {
        const valor = Number(inv.valor);
        if (inv.status_fatura === 'Aberta')
          stats.totalOpen += valor;
        if (inv.status_fatura === 'Paga')
          stats.totalReceived += valor;
        if (inv.status_fatura === 'Vencida')
          stats.overdueCount++;
      });

      return stats;
    },

    createInvoiceWithPix: async (apt: any) => {
      const { data: existingPix } = await supabase
        .from('pix_charges')
        .select('*, invoices!inner(*)')
        .eq('invoices.appointment_id', apt.id)
        .gt(
          'data_expiracao',
          new Date().toISOString()
        )
        .maybeSingle();

      if (existingPix) {
        return {
          txid: existingPix.txid,
          pixCopiaECola: existingPix.qrcode_copia_cola,
          valor: existingPix.valor_original,
          dataExpiracao: existingPix.data_expiracao,
          fromCache: true,
        };
      }

      const response = await fetch(
        GERAR_FATURA_WEBHOOK_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointment_id: apt.id,
            contact_id:
              apt.contact_id || apt.contactId,
            valor: apt.price,
            nome_cliente: apt.contactName,
            cpf: apt.contactCpf,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro no Webhook do Sicredi');
      }

      const data = await response.json();
      const res = data[0]?.response;

      const { data: newInv, error: invError } =
        await supabase
          .from('invoices')
          .upsert(
            {
              appointment_id: apt.id,
              contact_id:
                apt.contact_id || apt.contactId,
              valor: Number(res.valor_original),
              company_id: apt.company_id,
              status_fatura: 'Aberta',
            },
            { onConflict: 'appointment_id' }
          )
          .select()
          .single();

      if (invError) throw invError;

      await supabase.from('pix_charges').upsert({
        txid: res.txid,
        invoice_id: newInv.id,
        status_sicredi: 'PENDENTE',
        valor_original: res.valor_original,
        qrcode_copia_cola: res.pixCopiaECola,
        data_expiracao: res.dataExpiracao,
      });

      return {
        txid: res.txid,
        pixCopiaECola: res.pixCopiaECola,
        valor: res.valor_original,
        dataExpiracao: res.dataExpiracao,
      };
    },

    checkPaymentStatus: async (txid: string) => {
      const response = await fetch(
        CHECK_PAGAMENTO_WEBHOOK_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid }),
        }
      );

      if (!response.ok) {
        throw new Error(
          'Erro ao consultar webhook de status'
        );
      }

      const data = await response.json();
      const res = data[0]?.response;
      const status = res?.status || data.status;

      if (status) {
        const { data: pixCharge } =
          await supabase
            .from('pix_charges')
            .update({ status_sicredi: status })
            .eq('txid', txid)
            .select('invoice_id')
            .single();

        if (
          status === 'CONCLUIDA' ||
          status === 'PAGO'
        ) {
          await supabase
            .from('invoices')
            .update({ status_fatura: 'Paga' })
            .eq('id', pixCharge?.invoice_id);
        }
      }

      return status;
    },

    getPixCharge: async (invoiceId: string) => {
      const { data, error } = await supabase
        .from('pix_charges')
        .select('*')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  },

  settings: {
    /**
     * Busca as configurações da empresa
     */
    get: async (user: User) => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', getTargetId(user))
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    /**
     * Salva ou atualiza as configurações (Upsert)
     */
    save: async (user: User, formData: any) => {
      const { error } = await supabase
        .from('settings')
        .upsert({
          company_id: getTargetId(user),
          business_hours_start: formData.businessHoursStart,
          business_hours_end: formData.businessHoursEnd,
          working_days: formData.workingDays,
          offline_message: formData.offlineMessage,
          address: formData.address,
          website: formData.website,
          instagram: formData.instagram,
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id' }); // Conflito baseado no ID único da empresa

      if (error) throw error;
    }
  },
  
  /* ================= HELPERS ================= */
  helpers: {
    fetchFormDeps: async (user: User) => {
      const cid = getTargetId(user);

      const [contacts, services, professionals] =
        await Promise.all([
          supabase
            .from('contacts')
            .select('id, name')
            .eq('company_id', cid)
            .order('name'),

          supabase
            .from('services')
            .select('id, name, price')
            .eq('company_id', cid)
            .order('name'),

          supabase
            .from('professionals')
            .select('id, name')
            .eq('company_id', cid)
            .order('name'),
        ]);

      if (contacts.error) throw contacts.error;
      if (services.error) throw services.error;
      if (professionals.error)
        throw professionals.error;

      return {
        contacts: contacts.data || [],
        services: services.data || [],
        professionals: professionals.data || [],
      };
    },
  },
};
