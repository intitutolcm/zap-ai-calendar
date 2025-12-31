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
    const data = payload.data;
    const instanceName = payload.instance;

    if (payload.event !== "messages.upsert" || !data) return new Response("Ignorado");

    const message = data.message;
    const messageId = data.key?.id;
    const isFromMe = data.key?.fromMe === true;
    const phone = data.key.remoteJid.split("@")[0];
    const pushName = data.pushName || phone;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Busca Instância e Agente
    const { data: instanceDb } = await supabase
      .from("instances")
      .select("id, token, agents(prompt, enable_audio, enable_image)")
      .eq("name", instanceName)
      .maybeSingle();

    if (!instanceDb) return new Response("Instância não encontrada", { status: 404 });

    // 2. Sincronização de Contato e Conversa (com trava fromMe)
    const { data: contact } = await supabase.from("contacts")
      .upsert({ phone, name: pushName }, { onConflict: "phone" }).select().single();

    // Se o operador respondeu, desativamos a IA imediatamente no banco
    const { data: conversation } = await supabase.from("conversations")
      .upsert({ 
        contact_id: contact.id, 
        instance_id: instanceDb.id,
        is_human_active: isFromMe ? true : undefined 
      }, { onConflict: "contact_id" }).select().single();

    if (isFromMe) {
        console.log("👤 Operador respondeu via WhatsApp. IA Pausada.");
        await supabase.from("messages").insert({
            conversation_id: conversation.id,
            sender: "OPERATOR",
            content: message?.conversation || message?.extendedTextMessage?.text || "[Mídia enviada pelo operador]"
        });
        return new Response("Operador respondeu");
    }

    if (conversation.is_human_active) return new Response("Atendimento Humano Ativo");

    // 3. Extração de Conteúdo / Mídia
    let currentText = "";
    let useFallback = false;
    const mType = data.messageType;

    if (message?.conversation || message?.extendedTextMessage?.text) {
      currentText = message.conversation || message.extendedTextMessage.text;
    } 
    else if (mType === "audioMessage" || mType === "imageMessage") {
      const base64Manual = await getMediaBase64(instanceName, messageId);
      if (mType === "audioMessage" && instanceDb.agents?.enable_audio && base64Manual) {
        currentText = "[Áudio]: " + await transcribeAudio(base64Manual);
      } 
      else if (mType === "imageMessage" && instanceDb.agents?.enable_image && base64Manual) {
        currentText = "[Imagem]: " + await analyzeImage(base64Manual);
      } else { useFallback = true; }
    } else { useFallback = true; }

    if (useFallback) {
      await sendToWA(instanceName, instanceDb.token, phone, "Não consegui entender a mídia enviada, por favor descreva em texto.");
      return new Response("Fallback");
    }

    // 4. Registrar mensagem no Dashboard imediatamente
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender: "USER",
      content: currentText
    });

    // ==========================================
    // 5. LÓGICA DE DEBOUNCE (AGRUPAMENTO)
    // ==========================================
    // Usamos um timestamp único para esta execução
    const executionId = new Date().getTime(); 
    
    // Acumulamos no buffer do banco de dados
    const existingBuffer = conversation.temp_buffer || "";
    const updatedBuffer = (existingBuffer + " " + currentText).trim();

    const { data: updatedConv } = await supabase.from("conversations")
      .update({ 
        temp_buffer: updatedBuffer, 
        last_message_at: new Date(executionId).toISOString() 
      })
      .eq("id", conversation.id)
      .select("temp_buffer")
      .single();

    console.log(`⏳ Debounce iniciado (${executionId}) para ${phone}. Buffer: ${updatedBuffer}`);

    // Aguardamos 10 segundos
    await new Promise(res => setTimeout(res, 10000));

    // Verificamos se somos a última mensagem
    const { data: finalCheck } = await supabase.from("conversations")
      .select("last_message_at, temp_buffer")
      .eq("id", conversation.id)
      .single();

    const lastTimestampInDb = new Date(finalCheck.last_message_at).getTime();

    // Se o timestamp no banco for maior que o nosso executionId, outra função assumiu
    if (lastTimestampInDb > executionId) {
      console.log(`⏭️ Ignorando execução ${executionId}. Nova mensagem chegou depois.`);
      return new Response("Debounce: Ignorado");
    }

    // Se chegamos aqui, somos a thread responsável por responder!
    const fullPromptText = finalCheck.temp_buffer;
    console.log(`🚀 Processando bloco final: "${fullPromptText}"`);

    // Limpa o buffer imediatamente para evitar duplicidade
    await supabase.from("conversations").update({ temp_buffer: "" }).eq("id", conversation.id);

    // ==========================================
    // 6. CHAMADA IA COM HISTÓRICO
    // ==========================================
    const { data: history } = await supabase
      .from("messages")
      .select("sender, content")
      .eq("conversation_id", conversation.id)
      .order("timestamp", { ascending: false })
      .limit(8);

    const messagesForAI = history?.reverse().map(m => ({
      role: m.sender === "USER" ? "user" : "assistant",
      content: m.content
    })) || [];

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("OPENAI_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: instanceDb.agents?.prompt },
          ...messagesForAI,
          { role: "user", content: fullPromptText }
        ]
      })
    }).then(r => r.json());

    const reply = aiRes.choices?.[0]?.message?.content;

    if (reply) {
      await sendToWA(instanceName, instanceDb.token, phone, reply);
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "AI",
        content: reply
      });
    }

    return new Response("OK");

  } catch (error) {
    console.error("❌ ERRO:", error.message);
    return new Response(error.message, { status: 500 });
  }
});

// --- HELPERS ---

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
    return res.text || "(Áudio sem fala)";
  } catch { return "(Erro transcrição)"; }
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
            { type: "text", text: "Descreva a imagem." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }]
      })
    }).then(r => r.json());
    return res.choices[0].message.content;
  } catch { return "(Erro imagem)"; }
}

async function sendToWA(instance: string, token: string, number: string, text: string) {
  await fetch(`${Deno.env.get("EVO_API_URL")}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "apikey": token, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text })
  });
}