import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { ToastType } from '@/components/Toast';

interface CalendarPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

const CalendarPage: React.FC<CalendarPageProps> = ({ showToast }) => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterType, setFilterType] = useState<'day' | 'week' | 'month'>('month');

  const [formDeps, setFormDeps] = useState<{
    contacts: any[];
    services: any[];
    professionals: any[];
  }>({
    contacts: [],
    services: [],
    professionals: [],
  });

  const [formData, setFormData] = useState({
    contactId: '',
    serviceId: '',
    professionalId: '',
    date: '',
    time: '',
  });

  const getTodayBR = () => new Date().toLocaleDateString('en-CA');
  const todayStr = getTodayBR();

  const loadData = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      const [aptData, deps] = await Promise.all([
        api.appointments.list(user),
        api.helpers.fetchFormDeps(user),
      ]);

      setAppointments(aptData || []);
      setFormDeps(deps);
    } catch (error) {
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();

    return { firstDay, days };
  };

  const { firstDay, days } = getDaysInMonth(currentDate);

  const handleDateClick = (day: number, isPast: boolean) => {
    if (isPast) {
      showToast('Não é possível agendar em datas passadas.', 'info');
      return;
    }

    const selectedDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    setFormData({
      ...formData,
      date: selectedDate.toLocaleDateString('en-CA'),
    });

    setIsModalOpen(true);
  };

  const updateAptStatus = async (id: string, newStatus: string) => {
    try {
      await api.appointments.updateStatus(id, newStatus);
      showToast(`Status: ${newStatus}`, 'success');
      loadData();
    } catch (error) {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    if (formData.date < todayStr) {
      showToast('Data inválida.', 'error');
      return;
    }

    try {
      await api.appointments.create(formData, user);
      showToast('Agendamento realizado!', 'success');

      setIsModalOpen(false);
      setFormData({
        contactId: '',
        serviceId: '',
        professionalId: '',
        date: '',
        time: '',
      });

      loadData();
    } catch (error) {
      showToast('Erro ao agendar', 'error');
    }
  };

  // Paginação
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAppointments = appointments.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(appointments.length / itemsPerPage);

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-slate-50/30">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-4">Agenda</h1>
          <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('calendar')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500'}`}>Calendário</button>
            <button onClick={() => setActiveTab('list')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500'}`}>Lista</button>
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg active:scale-95 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6" strokeWidth="2" /></svg>
          Novo Agendamento
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Navegação e Filtros */}
          <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm gap-4">
            <div className="flex items-center gap-4">
               <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="2" /></svg>
               </button>
               <h2 className="text-xl font-bold text-slate-900 min-w-[180px] text-center capitalize">
                 {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
               </h2>
               <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="2" /></svg>
               </button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {['day', 'week', 'month'].map((t) => (
                <button key={t} onClick={() => setFilterType(t as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                  {t === 'day' ? 'Dia' : t === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>

          {/* Grid do Calendário */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="grid grid-cols-7 gap-4 mb-6">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-4">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                const dateKey = dateObj.toLocaleDateString('en-CA');
                
                // BLOQUEIO: Verifica se o dia é anterior a hoje
                const isPast = dateKey < todayStr;
                const isToday = dateKey === todayStr;
                const dayAppointments = appointments.filter(ap => ap.date === dateKey);

                return (
                  <div 
                    key={day} 
                    onClick={() => handleDateClick(day, isPast)}
                    className={`aspect-square rounded-[1.8rem] border flex flex-col items-center justify-between p-3 transition-all relative
                      ${isPast 
                        ? 'bg-slate-50 border-transparent opacity-40 cursor-not-allowed' 
                        : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer'
                      }
                      ${isToday ? 'ring-2 ring-indigo-600 ring-offset-2' : ''}
                    `}
                  >
                    <span className={`text-sm font-black ${isPast ? 'text-slate-400' : isToday ? 'text-indigo-600' : 'text-slate-900'}`}>{day}</span>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {dayAppointments.slice(0, 3).map((ap, idx) => (
                        <span key={idx} className={`w-1.5 h-1.5 rounded-full ${ap.status === 'CONFIRMED' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-6">Cliente</th>
                  <th className="px-8 py-6">Serviço</th>
                  <th className="px-8 py-6">Data/Hora</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentAppointments.map(ap => (
                  <tr key={ap.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-6 font-bold text-slate-900">{ap.contactName}</td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-bold text-slate-700">{ap.serviceName}</div>
                      <div className="text-[10px] text-indigo-500 font-bold uppercase">{ap.professionalName}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-bold text-slate-900">{new Date(ap.date).toLocaleDateString('pt-BR')}</div>
                      <div className="text-xs text-slate-400">{ap.time}</div>
                    </td>
                    <td className="px-8 py-6">
                      <select 
                        value={ap.status} 
                        onChange={(e) => updateAptStatus(ap.id, e.target.value)}
                        className={`text-[10px] font-bold uppercase px-4 py-2 rounded-xl border-none outline-none ring-1 ring-inset ${
                          ap.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 
                          ap.status === 'CANCELLED' ? 'bg-rose-50 text-rose-600 ring-rose-100' : 'bg-amber-50 text-amber-600 ring-amber-100'
                        }`}
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="CONFIRMED">Confirmado</option>
                        <option value="CANCELLED">Cancelado</option>
                      </select>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="2"/></svg></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="2"/></svg></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 animate-in zoom-in duration-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-8">Agendar Horário</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">Cliente</label>
                <select required className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-500 font-medium" value={formData.contactId} onChange={e => setFormData({...formData, contactId: e.target.value})}>
                  <option value="">Selecione o Cliente</option>
                  {formDeps.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select required className="px-5 py-4 rounded-2xl bg-slate-50 border-slate-100 font-medium outline-none focus:border-indigo-500" value={formData.serviceId} onChange={e => setFormData({...formData, serviceId: e.target.value})}>
                  <option value="">Serviço</option>
                  {formDeps.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select required className="px-5 py-4 rounded-2xl bg-slate-50 border-slate-100 font-medium outline-none focus:border-indigo-500" value={formData.professionalId} onChange={e => setFormData({...formData, professionalId: e.target.value})}>
                  <option value="">Profissional</option>
                  {formDeps.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="date" 
                  required 
                  min={todayStr} // BLOQUEIO NO INPUT: Não permite selecionar datas passadas
                  className="px-5 py-4 rounded-2xl bg-slate-50 border-slate-100 font-medium outline-none focus:border-indigo-500" 
                  value={formData.date} 
                  onChange={e => setFormData({...formData, date: e.target.value})} 
                />
                <input type="time" required className="px-5 py-4 rounded-2xl bg-slate-50 border-slate-100 font-medium outline-none focus:border-indigo-500" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;