/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { KeyRound } from 'lucide-react';

interface ApiKeyDialogProps {
  onContinue: () => void;
  onClose: () => void;
}

const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ onContinue, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[500] p-4 animate-fade-in">
      <div className="glass-panel bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center flex flex-col items-center relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div className="bg-[#FF853E]/20 p-4 rounded-full mb-6 text-[#FF853E]">
          <KeyRound className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Бесплатный лимит исчерпан</h2>
        <p className="text-zinc-300 mb-6">
          Вы исчерпали бесплатный лимит запросов в минуту. <strong>Платить не нужно</strong>, просто подождите примерно 1-2 минуты, и доступ восстановится автоматически.
        </p>
        <button
          onClick={onClose}
          className="w-full px-6 py-3 bg-[#FF853E] hover:bg-[#ff7020] text-black font-black uppercase tracking-wider rounded-xl transition-colors mb-4"
        >
          Хорошо, подожду
        </button>
        <button
          onClick={onContinue}
          className="text-zinc-500 hover:text-white font-medium transition-colors text-sm"
        >
          Ввести свой API ключ (для разработчиков)
        </button>
      </div>
    </div>
  );
};

export default ApiKeyDialog;