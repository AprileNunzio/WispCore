import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import type { EmailTemplate } from '../types';
import { MailPlus, Edit3, Trash2, X, Variable } from 'lucide-react';

const VARIABLES = ['nome_cliente', 'importo', 'scadenza', 'tipo_pagamento'];

const DEFAULT_TEMPLATE: Partial<EmailTemplate> = {
  name: 'Sollecito di pagamento',
  subject: 'Promemoria pagamento in scadenza - {{nome_cliente}}',
  body: 'Gentile {{nome_cliente}},\n\nLe ricordiamo che il pagamento di € {{importo}} ({{tipo_pagamento}}) risulta in scadenza il {{scadenza}}.\n\nLa preghiamo di regolarizzare la posizione a breve.\n\nGrazie,\nIl team WISP',
};

export const EmailTemplatesView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => setTemplates(await dbService.getEmailTemplates());

  const handleOpenNew = () => {
    setEditing({ ...DEFAULT_TEMPLATE });
    setShowModal(true);
  };

  const handleEdit = (t: EmailTemplate) => {
    setEditing(t);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDialog('Eliminare questo template email?');
    if (!confirmed) return;
    await dbService.deleteEmailTemplate(id);
    notify('Template eliminato.', 'success');
    loadData();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name || !editing?.subject || !editing?.body) return;
    await dbService.saveEmailTemplate(editing);
    notify(editing.id ? 'Template aggiornato.' : 'Template creato.', 'success');
    setShowModal(false);
    setEditing(null);
    loadData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <MailPlus className="text-blue-600" size={24} />
            <span>Template Email</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Modelli riutilizzabili per solleciti e comunicazioni, con variabili dinamiche</p>
        </div>
        <button onClick={handleOpenNew} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg shadow-blue-600/20 border border-blue-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0">
          <MailPlus size={16} /> <span>Nuovo Template</span>
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-5 border border-gray-200 text-sm text-gray-600 flex items-start gap-2.5">
        <Variable size={16} className="text-cyan-600 shrink-0 mt-0.5" />
        <div>
          Variabili disponibili, da inserire nel testo tra doppie graffe: {VARIABLES.map((v) => (
            <code key={v} className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-cyan-700">{'{{' + v + '}}'}</code>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {templates.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center text-gray-400 text-sm md:col-span-2">
            Nessun template creato. Ne serve almeno uno per inviare i solleciti dalla pagina Scadenze.
          </div>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="glass-panel p-5 rounded-2xl border border-gray-200 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="text-base font-bold text-gray-900">{t.name}</h3>
                <div className="flex gap-1.5">
                  <button onClick={() => handleEdit(t)} className="p-2 bg-gray-100 hover:bg-gray-200 text-blue-600 rounded-lg border border-gray-200 cursor-pointer"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(t.id)} className="p-2 bg-gray-100 hover:bg-rose-50 text-rose-600 rounded-lg border border-gray-200 cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="text-sm text-gray-600 font-medium">{t.subject}</p>
              <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-4">{t.body}</p>
            </div>
          ))
        )}
      </div>

      {showModal && editing && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Modifica Template' : 'Nuovo Template Email'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Nome Template *</label>
                <input type="text" required value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Oggetto *</label>
                <input type="text" required value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Corpo Email *</label>
                <textarea required value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono text-xs" rows={10} />
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl cursor-pointer">Annulla</button>
                <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer">Salva Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
