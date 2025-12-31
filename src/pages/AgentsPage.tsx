import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Agent, Instance } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';

interface AgentsPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

// Interface estendida para suportar os campos PACIF durante a edição
interface EditingAgent extends Partial<Agent> {
  targetInstance?: string;
  pacif?: {
    papel: string;
    contexto: string;
    acao: string;
    intencao: string;
    formato: string;
  };
}

const AgentsPage: React.FC<AgentsPageProps> = ({ showToast }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<EditingAgent | null>(null);
  const { user } = useAuth();

  // Função auxiliar para converter o prompt agrupado de volta para o objeto PACIF ao editar
  const parsePromptToPacif = (prompt: string) => {
    const sections = {
      papel: prompt.match(/# PAPEL\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      contexto: prompt.match(/# CONTEXTO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      acao: prompt.match(/# AÇÃO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      intencao: prompt.match(/# INTENÇÃO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      formato: prompt.match(/# FORMATO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
    };
    return sections;
  };

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [agentsData, instancesData] = await Promise.all([
        api.agents.list(user.id),
        api.instances.list()
      ]);
      setAgents(agentsData);
      setInstances(instancesData);
    } catch (error) {
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent || !user || !editingAgent.pacif) return;

    // Agrupa os campos PACIF no formato Markdown para a coluna Prompt
    const fullPrompt = `
# PAPEL
${editingAgent.pacif.papel}

# CONTEXTO
${editingAgent.pacif.contexto}

# AÇÃO
${editingAgent.pacif.acao}

# INTENÇÃO
${editingAgent.pacif.intencao}

# FORMATO
${editingAgent.pacif.formato}
`.trim();

    try {
      const agentToSave = { ...editingAgent, prompt: fullPrompt };
      delete agentToSave.pacif; // Remove o objeto auxiliar antes de enviar para a API

      const savedAgent = await api.agents.save(agentToSave, user.id);
      const finalAgentId = editingAgent.id || savedAgent.id;

      if (editingAgent.targetInstance) {
        await api.instances.updateAgent(editingAgent.targetInstance, finalAgentId);
      }

      showToast(editingAgent.id ? 'Agente atualizado!' : 'Agente criado!', 'success');
      setEditingAgent(null);
      loadData();
    } catch (error: any) {
      showToast(`Erro ao salvar: ${error.message}`, 'error');
    }
  };

  const openEditModal = (agent: Partial<Agent>, instanceName = '') => {
    const pacifData = agent.prompt 
      ? parsePromptToPacif(agent.prompt) 
      : { papel: '', contexto: '', acao: '', intencao: '', formato: '' };

    setEditingAgent({
      ...agent,
      targetInstance: instanceName,
      pacif: pacifData
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir este agente?')) {
      try {
        await api.agents.delete(id);
        showToast('Agente removido', 'success');
        loadData();
      } catch (error) { showToast('Erro ao excluir', 'error'); }
    }
  };

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full overflow-y-auto h-full custom-scrollbar">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Agentes de IA</h1>
          <p className="text-slate-500 mt-1">Configure o comportamento baseado na matriz PACIF</p>
        </div>
        <button
          onClick={() => openEditModal({ name: '', prompt: '', enableAudio: false, enableImage: false })}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Novo Agente
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {agents.map((agent) => {
          const linkedInstance = instances.find(i => i.agent_id === agent.id);
          return (
            <div key={agent.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all flex flex-col group relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                {linkedInstance && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ativo em: {linkedInstance.name}</span>
                  </div>
                )}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{agent.name}</h3>
              <p className="text-slate-500 text-sm mb-6 line-clamp-3 italic">
                {agent.prompt?.substring(0, 150)}...
              </p>
              <div className="mt-auto flex gap-3">
                <button onClick={() => openEditModal(agent, linkedInstance?.name)} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-colors">Configurar PACIF</button>
                <button onClick={() => handleDelete(agent.id)} className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal PACIF */}
      {editingAgent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto custom-scrollbar animate-in zoom-in duration-200">
            <div className="p-8 sm:p-10">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{editingAgent.id ? 'Editar Estrutura PACIF' : 'Novo Agente PACIF'}</h3>
                  <p className="text-sm text-slate-400">Preencha os campos para gerar o prompt perfeito</p>
                </div>
                <button onClick={() => setEditingAgent(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l18 18" /></svg>
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                {/* Configurações Básicas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Nome do Agente</label>
                    <input required value={editingAgent.name} onChange={e => setEditingAgent({...editingAgent, name: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" placeholder="Ex: Lú - Atendimento" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Vincular Instância</label>
                    <select value={editingAgent.targetInstance} onChange={e => setEditingAgent({...editingAgent, targetInstance: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-bold text-slate-600 appearance-none">
                      <option value="">Nenhuma</option>
                      {instances.map(inst => (<option key={inst.id} value={inst.name}>{inst.name}</option>))}
                    </select>
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Campos PACIF */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-indigo-500 uppercase mb-2 ml-1">P — Papel (Persona)</label>
                      <textarea required rows={3} value={editingAgent.pacif?.papel} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, papel: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-indigo-50/30 border border-indigo-100 outline-none focus:border-indigo-500 text-sm" placeholder="Quem a IA é? (Ex: Você é a Lú, assistente virtual...)" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-emerald-500 uppercase mb-2 ml-1">C — Contexto (Verdades)</label>
                      <textarea required rows={4} value={editingAgent.pacif?.contexto} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, contexto: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-emerald-50/30 border border-emerald-100 outline-none focus:border-emerald-500 text-sm" placeholder="Dados fixos, endereço, valores da clínica..." />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-500 uppercase mb-2 ml-1">I — Intenção (Objetivo)</label>
                      <textarea required rows={3} value={editingAgent.pacif?.intencao} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, intencao: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-amber-50/30 border border-amber-100 outline-none focus:border-amber-500 text-sm" placeholder="Qual o objetivo final? (Ex: Converter em agendamento)" />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-sky-500 uppercase mb-2 ml-1">A — Ação (Fluxo Step-by-Step)</label>
                      <textarea required rows={8} value={editingAgent.pacif?.acao} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, acao: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-sky-50/30 border border-sky-100 outline-none focus:border-sky-500 text-sm" placeholder="Passo 1: Cumprimentar... Passo 2: Pedir nome..." />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-rose-500 uppercase mb-2 ml-1">F — Formato (Guardrails)</label>
                      <textarea required rows={4} value={editingAgent.pacif?.formato} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, formato: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-rose-50/30 border border-rose-100 outline-none focus:border-rose-500 text-sm" placeholder="Limite de caracteres, uso de emojis, proibições..." />
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={editingAgent.enableAudio} onChange={e => setEditingAgent({...editingAgent, enableAudio: e.target.checked})} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-600">Habilitar Áudio</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={editingAgent.enableImage} onChange={e => setEditingAgent({...editingAgent, enableImage: e.target.checked})} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-600">Gerar Imagens</span>
                  </label>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setEditingAgent(null)} className="flex-1 py-4 font-bold text-slate-400">Cancelar</button>
                  <button type="submit" className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all">
                    {editingAgent.id ? 'Atualizar Agente' : 'Criar Agente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentsPage;