
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getAIResponse = async (prompt: string, history: { role: 'user' | 'model', content: string }[], systemInstruction: string) => {
  try {
    const model = 'gemini-3-flash-preview';
    
    // We'll use simple generateContent since chats can be complex to sync with mock UI history
    // But we'll pass history manually in the prompt or use chat
    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    const response = await chat.sendMessage({ message: prompt });
    return response.text || "Desculpe, não consegui processar sua mensagem agora.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Ocorreu um erro ao conectar com a IA. Verifique sua chave de API.";
  }
};
