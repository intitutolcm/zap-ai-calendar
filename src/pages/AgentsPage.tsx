import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Agent, Instance } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';
import { supabase } from '@/services/supabase';

interface AgentsPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

interface EditingAgent extends Partial<Agent> {
  targetInstance?: string;
  is_multi_agent?: boolean;
  parent_agent_id?: string | null;
  pacif?: {
    papel: string;
    contexto: string;
    regras: string;
    acao: string;
    intencao: string;
    formato: string;
  };
}

const AgentsPage: React.FC<AgentsPageProps> = ({ showToast }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<EditingAgent | null>(null);
  const { user } = useAuth();

  // Estados para Ferramentas Dinâmicas
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const parsePromptToPacif = (prompt: string) => {
    return {
      papel: prompt.match(/# PAPEL\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      contexto: prompt.match(/# CONTEXTO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      regras: prompt.match(/# REGRAS\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      acao: prompt.match(/# AÇÃO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      intencao: prompt.match(/# INTENÇÃO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
      formato: prompt.match(/# FORMATO\n([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || '',
    };
  };

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [agentsData, instancesData, templatesData, toolsData] = await Promise.all([
        api.agents.list(user),
        api.instances.list(user),
        api.templates.listAll(user),
        supabase.from('tools').select('*') // Busca ferramentas do banco
      ]);
      setAgents(agentsData);
      setInstances(instancesData);
      setTemplates(templatesData);
      setAvailableTools(toolsData.data || []);
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

    const fullPrompt = `
# PAPEL
${editingAgent.pacif.papel}

# CONTEXTO
${editingAgent.pacif.contexto}

# REGRAS
${editingAgent.pacif.regras}

# AÇÃO
${editingAgent.pacif.acao}

# INTENÇÃO
${editingAgent.pacif.intencao}

# FORMATO
${editingAgent.pacif.formato}
`.trim();

    try {
      console.log("💾 Salvando Agente...");
      const agentToSave = { 
        ...editingAgent, 
        prompt: fullPrompt,
        isMultiAgent: editingAgent.is_multi_agent,
        parentAgentId: editingAgent.is_multi_agent ? null : editingAgent.parent_agent_id 
      };
      delete agentToSave.pacif;

      const savedAgent = await api.agents.save(agentToSave, user);
      const agentId = editingAgent.id || savedAgent.id;

      // 1. Sincronizar Ferramentas (agent_tools)
      await supabase.from('agent_tools').delete().eq('agent_id', agentId);
      if (selectedTools.length > 0) {
        const toolLinks = selectedTools.map(tId => ({ agent_id: agentId, tool_id: tId }));
        await supabase.from('agent_tools').insert(toolLinks);
      }

      // 2. Vincular Instância se for Principal
      if (editingAgent.is_multi_agent && editingAgent.targetInstance) {
        await api.instances.updateAgent(editingAgent.targetInstance, agentId);
      }

      showToast('Agente e Ferramentas salvos!', 'success');
      setEditingAgent(null);
      loadData();
    } catch (error: any) {
      showToast(`Erro ao salvar: ${error.message}`, 'error');
    }
  };

  const openEditModal = async (agent: Partial<Agent>, instanceName = '') => {
    const pacifData = agent.prompt 
      ? parsePromptToPacif(agent.prompt) 
      : { papel: '', contexto: '', regras: '', acao: '', intencao: '', formato: '' };

    // Buscar ferramentas já vinculadas a este agente
    let currentTools: string[] = [];
    if (agent.id) {
      const { data } = await supabase.from('agent_tools').select('tool_id').eq('agent_id', agent.id);
      currentTools = data?.map(t => t.tool_id) || [];
    }

    setSelectedTools(currentTools);
    setEditingAgent({
      ...agent,
      targetInstance: instanceName,
      is_multi_agent: (agent as any).isMultiAgent ?? false, 
      parent_agent_id: (agent as any).parentAgentId ?? null,
      pacif: pacifData
    });
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template && editingAgent) {
      setEditingAgent({
        ...editingAgent,
        pacif: {
          papel: template.papel || '',
          contexto: template.contexto || '',
          regras: template.regras || '',
          acao: template.acao || '',
          intencao: template.intencao || '',
          formato: template.formato || ''
        }
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full overflow-y-auto h-full custom-scrollbar">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Agentes de IA</h1>
          <p className="text-slate-500 mt-1">Configure o comportamento e as ferramentas do sistema</p>
        </div>
        <button
          onClick={() => openEditModal({ name: '', prompt: '', enableAudio: false, enableImage: false })}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" /></svg>
          Novo Agente
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {agents.map((agent) => {
          const isMulti = (agent as any).isMultiAgent;
          const isChild = !!(agent as any).parentAgentId;
          const linkedInstance = instances.find(i => i.agent_id === agent.id);
          
          return (
            <div key={agent.id} className={`bg-white border ${isMulti ? 'border-indigo-200 ring-2 ring-indigo-50' : 'border-slate-200'} rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all flex flex-col group relative overflow-hidden`}>
              <div className="flex justify-between items-start mb-6">
                <div className={`p-4 ${isMulti ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"} rounded-2xl`}>
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isMulti ? <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth="2"/> : <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18" strokeWidth="2"/>}
                  </svg>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {linkedInstance && <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">Ativo: {linkedInstance.name}</span>}
                  {isMulti && <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black">Router Principal</span>}
                  {isChild && <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">Sub-Agente</span>}
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{agent.name}</h3>
              <p className="text-slate-500 text-sm mb-6 line-clamp-2 italic">{agent.prompt?.substring(0, 120)}...</p>
              <div className="mt-auto flex gap-3">
                <button onClick={() => openEditModal(agent, linkedInstance?.name)} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-colors">Configurar</button>
                <button onClick={() => handleDelete(agent.id)} className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
              </div>
            </div>
          );
        })}
      </div>

      {editingAgent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[2.5rem] shadow-2xl overflow-y-auto custom-scrollbar animate-in zoom-in duration-200">
            <div className="p-8 sm:p-10">
              
              {/* TOP SWITCH: MULTI AGENT FLAG */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div className="p-4 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-center gap-4">
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editingAgent.is_multi_agent} 
                      onChange={e => setEditingAgent({...editingAgent, is_multi_agent: e.target.checked})} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </div>
                  <span className="text-sm font-black text-indigo-700 uppercase tracking-tighter">Este é um Agente Principal (Router)</span>
                </div>
                <button onClick={() => setEditingAgent(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors self-end md:self-auto"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2"/></svg></button>
              </div>

              {/* HIERARQUIA E TEMPLATE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{editingAgent.is_multi_agent ? "Instância Vinculada" : "Vincular ao Agente Principal"}</label>
                  {editingAgent.is_multi_agent ? (
                    <select value={editingAgent.targetInstance} onChange={e => setEditingAgent({...editingAgent, targetInstance: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-indigo-200 outline-none text-sm font-bold appearance-none">
                      <option value="">Nenhuma Instância Selecionada</option>
                      {instances.map(inst => <option key={inst.id} value={inst.name}>{inst.name}</option>)}
                    </select>
                  ) : (
                    <select value={editingAgent.parent_agent_id || ''} onChange={e => setEditingAgent({...editingAgent, parent_agent_id: e.target.value || null})} className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none text-sm appearance-none">
                      <option value="">Nenhum Agente Pai (Independente)</option>
                      {agents.filter(a => (a as any).isMultiAgent && a.id !== editingAgent.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Carregar Modelo de Prompt</label>
                  <select onChange={(e) => handleApplyTemplate(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none text-sm" defaultValue=""><option value="" disabled>Escolha um template...</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Nome de Identificação Interna</label>
                  <input required value={editingAgent.name} onChange={e => setEditingAgent({...editingAgent, name: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" placeholder="Ex: Lú - Atendente Agendamentos" />
                </div>

                {/* MATRIZ PACRIF */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div><label className="block text-xs font-bold text-indigo-500 uppercase mb-2 ml-1">P — Papel</label><textarea required rows={3} value={editingAgent.pacif?.papel} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, papel: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-indigo-50/30 border border-indigo-100 text-sm outline-none focus:border-indigo-500" /></div>
                    <div><label className="block text-xs font-bold text-emerald-500 uppercase mb-2 ml-1">C — Contexto</label><textarea required rows={4} value={editingAgent.pacif?.contexto} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, contexto: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-emerald-50/30 border border-emerald-100 text-sm outline-none focus:border-emerald-500" /></div>
                    <div><label className="block text-xs font-bold text-violet-500 uppercase mb-2 ml-1">R — Regras</label><textarea required rows={4} value={editingAgent.pacif?.regras} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, regras: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-violet-50/30 border border-violet-100 text-sm outline-none focus:border-violet-500" /></div>
                  </div>
                  <div className="space-y-6">
                    <div><label className="block text-xs font-bold text-sky-500 uppercase mb-2 ml-1">A — Ação</label><textarea required rows={6} value={editingAgent.pacif?.acao} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, acao: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-sky-50/30 border border-sky-100 text-sm outline-none focus:border-sky-500" /></div>
                    <div><label className="block text-xs font-bold text-amber-500 uppercase mb-2 ml-1">I — Intenção</label><textarea required rows={3} value={editingAgent.pacif?.intencao} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, intencao: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-amber-50/30 border border-amber-100 text-sm outline-none focus:border-amber-500" /></div>
                    <div><label className="block text-xs font-bold text-rose-500 uppercase mb-2 ml-1">F — Formato</label><textarea required rows={3} value={editingAgent.pacif?.formato} onChange={e => setEditingAgent({...editingAgent, pacif: {...editingAgent.pacif!, formato: e.target.value}})} className="w-full px-5 py-4 rounded-2xl bg-rose-50/30 border border-rose-100 text-sm outline-none focus:border-rose-500" /></div>
                  </div>
                </div>

                {/* HABILIDADES (TOOLS) DINÂMICAS */}
                <div className="p-8 bg-slate-900 rounded-[2.5rem] mt-6 shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Habilidades / Functions Ativas</label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableTools.map(tool => (
                      <label key={tool.id} className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer border transition-all ${selectedTools.includes(tool.id) ? 'bg-indigo-600 border-indigo-400 shadow-indigo-500/20' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                        <input 
                          type="checkbox" 
                          checked={selectedTools.includes(tool.id)}
                          onChange={(e) => {
                            if(e.target.checked) setSelectedTools([...selectedTools, tool.id]);
                            else setSelectedTools(selectedTools.filter(id => id !== tool.id));
                          }}
                          className="w-6 h-6 text-indigo-500 rounded-lg bg-slate-700 border-none focus:ring-0"
                        />
                        <div>
                          <p className={`text-sm font-bold ${selectedTools.includes(tool.id) ? 'text-white' : 'text-slate-200'}`}>{tool.name.replace(/_/g, ' ')}</p>
                          <p className={`text-[10px] ${selectedTools.includes(tool.id) ? 'text-indigo-100' : 'text-slate-400'}`}>{tool.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* CONFIGURAÇÕES MULTIMÍDIA (SÓ PRINCIPAL) */}
                {editingAgent.is_multi_agent && (
                  <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 animate-in slide-in-from-bottom-2 duration-500">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={editingAgent.enableAudio} onChange={e => setEditingAgent({...editingAgent, enableAudio: e.target.checked})} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600" />
                      <span className="text-sm font-bold text-slate-600">Ativar Áudio (Whisper)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={editingAgent.enableImage} onChange={e => setEditingAgent({...editingAgent, enableImage: e.target.checked})} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600" />
                      <span className="text-sm font-bold text-slate-600">Ativar Visão (Vision)</span>
                    </label>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setEditingAgent(null)} className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 transition-colors">Descartar</button>
                  <button type="submit" className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                    {editingAgent.id ? 'Salvar Alterações' : 'Finalizar e Criar Agente'}
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