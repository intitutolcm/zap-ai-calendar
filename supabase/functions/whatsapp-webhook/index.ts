import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const instanceName = payload.instance;
    const data = payload.data;

    // Ignorar eventos que não sejam mensagens recebidas
    if (payload.event !== "messages.upsert" || !data) return new Response("Ignorado");

    const message = data.message;
    const messageId = data.key?.id;
    const isFromMe = data.key?.fromMe === true;
    const remoteJid = data.key?.remoteJid || "";
    const phone = remoteJid.split("@")[0];
    const pushName = data.pushName || phone;

    // Ignorar mensagens de grupos (opcional, dependendo do seu caso)
    if (remoteJid.includes("@g.us")) return new Response("Grupo ignorado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    
    // 1. Busca Instância e Agente vinculado
    const { data: inst, error: instError } = await supabase
      .from("instances")
      .select(`
        id, 
        company_id, 
        token,
        agents (
          prompt, 
          enable_audio, 
          enable_image
        )
      `)
      .eq("name", instanceName)
      .maybeSingle();

    if (instError || !inst) {
      console.error("Erro Instance:", instError);
      return new Response("Instância não encontrada", { status: 404 });
    }

    // 2. Agora buscamos as configurações da empresa usando o company_id da instância
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("company_id", inst.company_id)
      .maybeSingle();

    // Atribuímos ao objeto inst para manter a compatibilidade com o resto do código
    inst.settings = settings;

    const companyId = inst.company_id;

    // 2. Sincronização de Contato e Conversa (Garantindo Isolamento por Empresa)
    const { data: contact } = await supabase.from("contacts")
      .upsert({ phone, name: pushName, company_id: companyId }, { onConflict: "phone" })
      .select().single();

    const { data: conversation } = await supabase.from("conversations")
      .upsert({ 
        contact_id: contact.id, 
        instance_id: inst.id,
        is_human_active: isFromMe ? true : undefined // Se o operador responder, pausa a IA
      }, { onConflict: "contact_id" }).select().single();

    // 3. Tratamento de resposta do Operador via WhatsApp
    if (isFromMe) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "OPERATOR",
        content: message?.conversation || message?.extendedTextMessage?.text || "[Mídia enviada pelo operador]"
      });
      return new Response("OK: Resposta do operador registrada");
    }

    // Se o atendimento humano estiver ativo no Dashboard, a IA não responde
    if (conversation.is_human_active) return new Response("Atendimento Humano Ativo");

    // 4. Verificação de Horário Comercial (Fuso Brasília)
    const checkOpen = isBusinessOpen(inst.settings);
    if (!checkOpen.isOpen) {
      const offlineMsg = inst.settings?.offline_message || "Olá! No momento estamos fora do nosso horário de atendimento.";
      
      // Registrar mensagem do usuário e resposta de ausência
      await supabase.from("messages").insert([
        { conversation_id: conversation.id, sender: "USER", content: message?.conversation || "[Mídia fora de hora]" },
        { conversation_id: conversation.id, sender: "AI", content: offlineMsg }
      ]);

      await sendToWA(instanceName, inst.token, phone, offlineMsg);
      return new Response("Empresa Fechada");
    }

    // 5. Extração de Conteúdo (Texto / Áudio / Imagem)
    let currentText = "";
    const mType = data.messageType;

    if (message?.conversation || message?.extendedTextMessage?.text) {
      currentText = message.conversation || message.extendedTextMessage.text;
    } 
    else if (mType === "audioMessage" && inst.agents?.enable_audio) {
      const base64 = await getMediaBase64(instanceName, messageId);
      currentText = base64 ? `[Áudio transcrito]: ${await transcribeAudio(base64)}` : "";
    } 
    else if (mType === "imageMessage" && inst.agents?.enable_image) {
      const base64 = await getMediaBase64(instanceName, messageId);
      currentText = base64 ? `[Descrição da imagem enviada]: ${await analyzeImage(base64)}` : "";
    }

    if (!currentText) {
      await sendToWA(instanceName, inst.token, phone, "Desculpe, não consegui processar sua mensagem. Poderia escrever em texto?");
      return new Response("Formato não suportado");
    }

    // 6. Registro Imediato no Banco (Dashboard)
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender: "USER",
      content: currentText
    });

    // 7. Lógica de Debounce (Agrupamento de Mensagens)
    const executionId = new Date().getTime(); 
    const updatedBuffer = ((conversation.temp_buffer || "") + " " + currentText).trim();

    await supabase.from("conversations")
      .update({ temp_buffer: updatedBuffer, last_message_at: new Date(executionId).toISOString() })
      .eq("id", conversation.id);

    // Aguarda 10 segundos para ver se o utilizador envia mais alguma coisa
    await new Promise(res => setTimeout(res, 10000));

    const { data: finalCheck } = await supabase.from("conversations")
      .select("last_message_at, temp_buffer")
      .eq("id", conversation.id).single();

    // Se o timestamp mudou, outra execução mais recente assumiu o agrupamento
    if (new Date(finalCheck.last_message_at).getTime() > executionId) return new Response("Aguardando mais mensagens...");

    const textToProcess = finalCheck.temp_buffer;
    await supabase.from("conversations").update({ temp_buffer: "" }).eq("id", conversation.id);

    // 8. Construção do Contexto da IA (Agente + Dados da Empresa)
    const businessContext = `
# CONTEXTO ADICIONAL DA EMPRESA
- Endereço: ${inst.settings?.address || 'Não informado'}
- Website: ${inst.settings?.website || 'Não informado'}
- Instagram: @${inst.settings?.instagram || 'Não informado'}
- Horário: ${inst.settings?.business_hours_start} às ${inst.settings?.business_hours_end}
- Dias de funcionamento: ${inst.settings?.working_days?.join(', ')}
    `;

    // 9. Chamada IA (OpenAI) com Histórico
    const { data: history } = await supabase
      .from("messages")
      .select("sender, content")
      .eq("conversation_id", conversation.id)
      .order("timestamp", { ascending: false }).limit(10);

    const messagesForAI = history?.reverse().map(m => ({
      role: m.sender === "USER" ? "user" : "assistant",
      content: m.content
    })) || [];

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${Deno.env.get("OPENAI_KEY")}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: (inst.agents?.prompt || "") + "\n" + businessContext },
          ...messagesForAI,
          { role: "user", content: textToProcess }
        ]
      })
    }).then(r => r.json());

    const reply = aiRes.choices?.[0]?.message?.content;

    // 10. Resposta Final
    if (reply) {
      await sendToWA(instanceName, inst.token, phone, reply);
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "AI",
        content: reply
      });
    }

    return new Response("Mensagem processada com sucesso");

  } catch (error) {
    console.error("ERRO CRÍTICO:", error.message);
    return new Response(error.message, { status: 500 });
  }
});

// --- HELPERS ---

function isBusinessOpen(settings: any) {
  if (!settings) return { isOpen: true };
  const now = new Date();
  const options: any = { timeZone: 'America/Sao_Paulo', hour12: false };
  
  const currentDay = new Intl.DateTimeFormat('pt-BR', { ...options, weekday: 'long' }).format(now);
  const currentTime = new Intl.DateTimeFormat('pt-BR', { ...options, hour: '2-digit', minute: '2-digit' }).format(now).replace(':', '');

  // Formata o dia para bater com o array: "segunda-feira" -> "Segunda"
  const dayFormatted = currentDay.split('-')[0].charAt(0).toUpperCase() + currentDay.split('-')[0].slice(1);
  
  if (!settings.working_days?.includes(dayFormatted)) return { isOpen: false, reason: 'day' };

  const start = settings.business_hours_start?.replace(/:/g, '').slice(0, 4);
  const end = settings.business_hours_end?.replace(/:/g, '').slice(0, 4);

  if (currentTime < start || currentTime > end) return { isOpen: false, reason: 'hour' };

  return { isOpen: true };
}

async function getMediaBase64(instance: string, messageId: string) {
  try {
    const res = await fetch(`${Deno.env.get("EVO_API_URL")}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'apikey': Deno.env.get("EVO_API_KEY")!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: { id: messageId } } })
    });
    const json = await res.json();
    return json.base64 || null;
  } catch { return null; }
}

async function transcribeAudio(base64: string) {
  try {
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const formData = new FormData();
    formData.append("file", new Blob([binary], { type: "audio/ogg" }), "audio.ogg");
    formData.append("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("OPENAI_KEY")}` },
      body: formData
    }).then(r => r.json());
    return res.text || "(Áudio vazio)";
  } catch { return "(Erro na transcrição)"; }
}

async function analyzeImage(base64: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("OPENAI_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Descreva brevemente esta imagem para contexto de atendimento." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }]
      })
    }).then(r => r.json());
    return res.choices[0].message.content;
  } catch { return "(Erro na análise da imagem)"; }
}

async function sendToWA(instance: string, token: string, number: string, text: string) {
  await fetch(`${Deno.env.get("EVO_API_URL")}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "apikey": token, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text })
  });
}