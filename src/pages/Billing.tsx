import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Invoice, PixCharge } from '@/types';
import { QRCodeCanvas } from 'qrcode.react';
import { ToastType } from '@/components/Toast';

interface BillingPageProps {
  showToast: (msg: string, type: ToastType) => void;
}

const BillingPage: React.FC<BillingPageProps> = ({ showToast }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [pixCharge, setPixCharge] = useState<PixCharge | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Carregamos faturas e agendamentos para cruzar os dados
      const [invData, aptData] = await Promise.all([
        api.billing.listInvoices(),
        api.appointments.list()
      ]);
      setInvoices(invData || []);
      setAppointments(aptData || []);
    } catch (error) {
      showToast('Erro ao carregar dados financeiros', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Cálculos Dinâmicos baseados nos Agendamentos
  const stats = {
    confirmados: appointments.filter(a => a.status === 'CONFIRMED').reduce((acc, curr) => acc + (curr.price || 0), 0),
    pendentes: appointments.filter(a => a.status === 'PENDING').reduce((acc, curr) => acc + (curr.price || 0), 0),
    cancelados: appointments.filter(a => a.status === 'CANCELLED').reduce((acc, curr) => acc + (curr.price || 0), 0),
    recebido: invoices.filter(i => i.status_fatura === 'Paga').reduce((acc, curr) => acc + curr.valor, 0)
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paga': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Aberta': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Vencida': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const handleViewPix = async (invoice: Invoice) => {
    try {
      const charge = await api.billing.getPixCharge(invoice.id);
      if (charge) {
        setSelectedInvoice(invoice);
        setPixCharge(charge);
      } else {
        showToast('Cobrança PIX não gerada para esta fatura.', 'info');
      }
    } catch (error) {
      showToast('Erro ao buscar dados do PIX', 'error');
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-slate-50/50">
      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-8">Financeiro</h1>

      {/* Grid de Cards de Previsão */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">A Receber (Confirmados)</p>
          <p className="text-2xl font-black text-indigo-600">R$ {stats.confirmados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-2 text-[10px] text-slate-400 font-medium italic">Baseado em agendamentos confirmados</div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Potencial (Pendentes)</p>
          <p className="text-2xl font-black text-amber-500">R$ {stats.pendentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-2 text-[10px] text-slate-400 font-medium italic">Agendamentos aguardando aprovação</div>
        </div>

        <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Recebido</p>
          <p className="text-2xl font-black text-emerald-700">R$ {stats.recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-2 text-[10px] text-emerald-500 font-medium italic">Faturas marcadas como pagas</div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Perda (Cancelados)</p>
          <p className="text-2xl font-black text-rose-500">R$ {stats.cancelados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="mt-2 text-[10px] text-rose-400 font-medium italic">Valor de serviços cancelados</div>
        </div>
      </div>

      {/* Listagem de Cobranças */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Gestão de Cobranças</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-5">Cliente / Fatura</th>
                <th className="px-8 py-5">Valor</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-slate-900">{invoice.contato_nome}</p>
                    <p className="text-[10px] text-slate-400">Emissão: {new Date(invoice.data_emissao).toLocaleDateString('pt-BR')}</p>
                  </td>
                  <td className="px-8 py-6 font-black text-slate-900">
                    R$ {invoice.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(invoice.status_fatura)}`}>
                      {invoice.status_fatura}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleViewPix(invoice)}
                        title="Ver QR Code PIX"
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal QR Code PIX */}
      {selectedInvoice && pixCharge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 flex flex-col items-center">
            <h3 className="text-2xl font-bold text-slate-900 mb-8 w-full text-center">Pagamento PIX</h3>
            
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-8 flex flex-col items-center w-full shadow-inner">
              <QRCodeCanvas value={pixCharge.qrcode_copia_cola} size={200} level={"H"} />
              <p className="mt-6 text-2xl font-black text-slate-900">R$ {pixCharge.valor_original.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>

            <button 
              onClick={() => {
                navigator.clipboard.writeText(pixCharge.qrcode_copia_cola);
                showToast('Código Copiado!', 'success');
              }}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 mb-4"
            >
              Copiar Código PIX
            </button>
            <button onClick={() => setSelectedInvoice(null)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;