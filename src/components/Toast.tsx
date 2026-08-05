import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve essere usato dentro <ToastProvider>');
  return ctx;
};

let idCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const icon = {
    success: <CheckCircle2 size={18} className="text-emerald-600" />,
    error: <XCircle size={18} className="text-rose-600" />,
    info: <Info size={18} className="text-blue-600" />,
  };

  const border = {
    success: 'border-emerald-200 bg-emerald-50',
    error: 'border-rose-200 bg-rose-50',
    info: 'border-blue-200 bg-blue-50',
  };

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl border backdrop-blur-xl shadow-lg text-xs text-gray-800 animate-toast-in ${border[t.kind]}`}
          >
            {icon[t.kind]}
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-700 cursor-pointer shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/** Lightweight promise-based confirm dialog to replace window.confirm(). */
interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((message: string) => Promise<boolean>) | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm deve essere usato dentro <ConfirmProvider>');
  return ctx;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirmFn = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve });
    });
  }, []);

  const handle = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {state && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-panel-glow bg-white rounded-2xl p-6 border border-gray-200 text-center">
            <p className="text-sm text-gray-700 mb-5">{state.message}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => handle(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl cursor-pointer text-xs font-medium"
              >
                Annulla
              </button>
              <button
                onClick={() => handle(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl cursor-pointer text-xs font-semibold"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
