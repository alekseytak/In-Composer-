/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Plus, Trash2, Check, RefreshCw, Server, Zap, Shield, 
  ExternalLink, CheckCircle2, AlertCircle, Cpu, X, Lock, Globe, Sparkles
} from 'lucide-react';
import { AIProviderConfig, ProviderType } from '../types';
import { 
  loadProviders, saveProviders, getActiveProviderId, 
  setActiveProviderId, testProviderConnection, DEFAULT_PROVIDERS 
} from '../services/providersService';

interface CustomProvidersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderChanged?: (provider: AIProviderConfig) => void;
}

const PRESET_URLS = [
  { label: 'OpenRouter (Бесплатные)', url: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-r1:free', keyPlaceholder: 'sk-or-v1-...' },
  { label: 'DeepSeek API', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyPlaceholder: 'sk-...' },
  { label: 'Groq Cloud (Быстрый)', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyPlaceholder: 'gsk_...' },
  { label: 'Ollama (Локально)', url: 'http://localhost:11434/v1', model: 'gemma:2b', keyPlaceholder: 'Ключ не нужен' },
  { label: 'LM Studio (Локально)', url: 'http://localhost:1234/v1', model: 'local-model', keyPlaceholder: 'Ключ не нужен' },
  { label: 'OpenAI Официальный', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyPlaceholder: 'sk-proj-...' },
];

export const CustomProvidersDialog: React.FC<CustomProvidersDialogProps> = ({
  isOpen,
  onClose,
  onProviderChanged,
}) => {
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [activeId, setActiveId] = useState<string>('gemini-native');
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; success?: boolean; message?: string; latency?: number }>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  // New provider draft state
  const [newProvider, setNewProvider] = useState<{
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  }>({
    name: 'Custom Provider',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'deepseek/deepseek-r1:free',
  });

  const [preTestLoading, setPreTestLoading] = useState(false);
  const [preTestResult, setPreTestResult] = useState<{ success?: boolean; message?: string; latency?: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const loaded = loadProviders();
      setProviders(loaded);
      const active = getActiveProviderId();
      setActiveId(active);
      setShowAddForm(false);
      setTestResults({});
      setPreTestResult(null);
    }
  }, [isOpen]);

  const handleSelectActive = (id: string) => {
    setActiveId(id);
    setActiveProviderId(id);
    const found = providers.find(p => p.id === id);
    if (found && onProviderChanged) {
      onProviderChanged(found);
    }
  };

  const handleUpdateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
    const updatedList = providers.map(p => p.id === id ? { ...p, ...updates } : p);
    setProviders(updatedList);
    saveProviders(updatedList);
    if (id === activeId && onProviderChanged) {
      const active = updatedList.find(p => p.id === id);
      if (active) onProviderChanged(active);
    }
  };

  const handleDeleteProvider = (id: string) => {
    if (providers.length <= 1) return;
    const filtered = providers.filter(p => p.id !== id);
    setProviders(filtered);
    saveProviders(filtered);
    if (activeId === id) {
      const nextActive = filtered[0].id;
      setActiveId(nextActive);
      setActiveProviderId(nextActive);
      if (onProviderChanged) onProviderChanged(filtered[0]);
    }
  };

  const handleTest = async (provider: AIProviderConfig) => {
    setTestResults(prev => ({
      ...prev,
      [provider.id]: { loading: true }
    }));

    const res = await testProviderConnection(provider);

    setTestResults(prev => ({
      ...prev,
      [provider.id]: {
        loading: false,
        success: res.success,
        message: res.message,
        latency: res.latencyMs
      }
    }));
  };

  const handlePreTestNew = async () => {
    if (!newProvider.baseUrl) return;
    setPreTestLoading(true);
    setPreTestResult(null);

    const tempConfig: AIProviderConfig = {
      id: 'temp',
      name: newProvider.name,
      type: 'custom_openai',
      baseUrl: newProvider.baseUrl,
      apiKey: newProvider.apiKey,
      model: newProvider.model || 'gpt-4o-mini',
      enabled: true,
    };

    const res = await testProviderConnection(tempConfig);
    setPreTestLoading(false);
    setPreTestResult({
      success: res.success,
      message: res.message,
      latency: res.latencyMs
    });
  };

  const handleApplyPreset = (preset: typeof PRESET_URLS[0]) => {
    setNewProvider(prev => ({
      ...prev,
      name: preset.label.split(' ')[0],
      baseUrl: preset.url,
      model: preset.model,
    }));
    setPreTestResult(null);
  };

  const handleCreateNew = () => {
    if (!newProvider.name || !newProvider.baseUrl) return;
    const created: AIProviderConfig = {
      id: `custom-${Date.now()}`,
      name: newProvider.name.trim() || 'Custom AI Endpoint',
      type: 'custom_openai',
      baseUrl: newProvider.baseUrl.trim(),
      apiKey: newProvider.apiKey.trim(),
      model: newProvider.model.trim() || 'default-model',
      enabled: true,
    };

    const updated = [...providers, created];
    setProviders(updated);
    saveProviders(updated);
    setShowAddForm(false);
    setPreTestResult(null);

    // Automatically set as active provider
    setActiveId(created.id);
    setActiveProviderId(created.id);
    if (onProviderChanged) onProviderChanged(created);

    setNewProvider({
      name: 'Custom Provider',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      model: 'deepseek/deepseek-r1:free',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-3xl max-h-[92vh] bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#FF853E]/10 text-[#FF853E] border border-[#FF853E]/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                ИИ-Провайдеры, URL и Ключи API
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Любой OpenAI-совместимый API
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Подключайте свои серверы (Ollama, vLLM) или сторонние сервисы (OpenRouter, Groq, DeepSeek) по URL и ключу
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          
          {/* Quick Notice Banner */}
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
            <Cpu className="w-5 h-5 text-[#FF853E] shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-300 leading-relaxed">
              <span className="font-semibold text-white">Умное распределение нагрузки: </span>
              Все текстовые задачи (директор, консилиум, дебаты, live-брейншторм) автоматически обращаются к выбранному активному провайдеру. Если у вас запущен локальный сервер (например, <code>http://localhost:11434/v1</code>), генерация будет работать на 100% бесплатно и без интернета.
            </div>
          </div>

          {/* Form to Add Custom Provider by URL and Key */}
          {showAddForm ? (
            <div className="p-5 rounded-xl bg-zinc-900 border-2 border-[#FF853E]/60 space-y-4 animate-slide-up shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#FF853E]" />
                  Добавление провайдера через URL и ключ
                </h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              {/* 1-Click Quick URL Presets */}
              <div>
                <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1.5 font-bold">
                  Быстрые пресеты популярных сервисов:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_URLS.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="text-[10px] font-bold text-zinc-300 block mb-1">
                    Название провайдера <span className="text-[#FF853E]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProvider.name}
                    onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                    placeholder="Например: Мой Ollama, OpenRouter Free"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF853E]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-300 block mb-1">
                    Base URL (API Endpoint) <span className="text-[#FF853E]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newProvider.baseUrl}
                      onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                      placeholder="https://openrouter.ai/api/v1 или http://localhost:11434/v1"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF853E]"
                    />
                    <Globe className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-300 block mb-1">
                    ID Модели (Model Name) <span className="text-[#FF853E]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProvider.model}
                    onChange={e => setNewProvider({ ...newProvider, model: e.target.value })}
                    placeholder="deepseek/deepseek-r1:free, gemma:2b, llama3..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF853E]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-300 block mb-1">
                    API Ключ (Bearer Token)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={newProvider.apiKey}
                      onChange={e => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                      placeholder="sk-... (для локальных серверов можно оставить пустым)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#FF853E]"
                    />
                    <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Pre-test status */}
              {preTestResult && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  preTestResult.success
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {preTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="flex-1">{preTestResult.message}</span>
                  {preTestResult.latency && <span className="font-mono text-[10px] opacity-75">{preTestResult.latency}ms</span>}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handlePreTestNew}
                  disabled={preTestLoading || !newProvider.baseUrl}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-zinc-700"
                >
                  {preTestLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#FF853E]" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                  <span>Проверить URL и ключ (Ping)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleCreateNew}
                    disabled={!newProvider.name || !newProvider.baseUrl}
                    className="px-4 py-2 rounded-lg bg-[#FF853E] hover:bg-[#ff7320] text-black text-xs font-bold transition-transform active:scale-95 shadow-md disabled:opacity-50"
                  >
                    Сохранить и активировать
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Настроенные провайдеры ({providers.length})
              </span>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3.5 py-1.5 rounded-xl bg-[#FF853E] hover:bg-[#ff7320] text-black text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>+ Добавить по URL и ключу</span>
              </button>
            </div>
          )}

          {/* Providers List */}
          <div className="space-y-3">
            {providers.map(p => {
              const isActive = p.id === activeId;
              const test = testResults[p.id];

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-zinc-900/90 border-[#FF853E]/60 shadow-[0_0_15px_rgba(255,133,62,0.1)]'
                      : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    
                    {/* Left: Radio & info */}
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleSelectActive(p.id)}
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          isActive
                            ? 'border-[#FF853E] bg-[#FF853E] text-black shadow-sm'
                            : 'border-zinc-600 hover:border-zinc-400'
                        }`}
                        title={isActive ? 'Активен' : 'Сделать активным'}
                      >
                        {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{p.name}</span>
                          {isActive && (
                            <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-[#FF853E]/20 text-[#FF853E]">
                              Активен
                            </span>
                          )}
                          <span className="text-[11px] text-zinc-400 font-mono">
                            ({p.model})
                          </span>
                        </div>
                        {p.baseUrl && (
                          <span className="text-[10px] text-zinc-500 font-mono block">
                            Endpoint: {p.baseUrl}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        onClick={() => handleTest(p)}
                        disabled={test?.loading}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 border border-zinc-700/60 transition-colors"
                      >
                        {test?.loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-[#FF853E]" />
                        ) : (
                          <Zap className="w-3 h-3 text-amber-400" />
                        )}
                        <span>Тест связи</span>
                      </button>

                      {!p.isDefault && (
                        <button
                          onClick={() => handleDeleteProvider(p.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Удалить провайдера"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Inline URL, API Key & Model Configuration */}
                  <div className="mt-3 pt-3 border-t border-zinc-800/60 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">
                        Endpoint URL
                      </label>
                      <input
                        type="text"
                        value={p.baseUrl || ''}
                        onChange={e => handleUpdateProvider(p.id, { baseUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#FF853E]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">
                        API Ключ
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          placeholder={p.type === 'gemini' ? 'Системный ключ Google' : 'sk-... или ключ'}
                          value={p.apiKey}
                          onChange={e => handleUpdateProvider(p.id, { apiKey: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#FF853E]"
                        />
                        <Lock className="w-3 h-3 text-zinc-600 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">
                        Модель (Model ID)
                      </label>
                      <input
                        type="text"
                        value={p.model}
                        onChange={e => handleUpdateProvider(p.id, { model: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#FF853E]"
                      />
                    </div>
                  </div>

                  {/* Ping Test Result Banner */}
                  {test && !test.loading && (
                    <div className={`mt-2.5 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${
                      test.success
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {test.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate flex-1">{test.message}</span>
                      {test.latency && (
                        <span className="font-mono text-[10px] opacity-80 shrink-0">
                          {test.latency}ms
                        </span>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-400">
            Все настройки и ключи сохраняются исключительно в локальном браузере.
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors"
          >
            Готово
          </button>
        </div>

      </div>
    </div>
  );
};

export default CustomProvidersDialog;
