
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Box, Share2, User, Zap, Settings, Moon, Plus, Trash2, Download, Wand2, 
  Briefcase, MessageSquare, Image as ImageIcon, Terminal, Sun, FolderPlus, 
  Copy, RefreshCw, Loader2, Activity, X, Folder as FolderIcon, ChevronDown, Maximize2,
  Mic, MicOff, Send, Volume2, HelpCircle, Menu, Crop, KeyRound, Sliders
} from 'lucide-react';
import { 
  AppMode, AppTheme, Asset, GenerationResult, AgentStep, 
  SymposiumDebate, ConsiliumExpert, Language, Resolution, ExportFormat, Project, Folder 
} from './types';
import { 
  generateImage, getConsiliumFeedback, runSymposiumDebate,
  analyzeImage, agentResearch, refinePrompt, getAgentPlan, getLiveBrainstormResponse, generateSpeech
} from './services/geminiService';
import ApiKeyDialog from './components/ApiKeyDialog';
import { useApiKey } from './hooks/useApiKey';
import ImageEditorModal from './components/ImageEditorModal';
import CustomProvidersDialog from './components/CustomProvidersDialog';
import { getActiveProvider } from './services/providersService';

const safeGetStorage = <T,>(key: string, initialValue: T): T => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return initialValue;
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  } catch (error) {
    console.warn(`[LocalStorage] Could not read ${key}:`, error);
    return initialValue;
  }
};

const safeSetStorage = (key: string, data: any) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn(`[LocalStorage] Could not save ${key}:`, error);
    try {
      if (Array.isArray(data) && data.length > 3) {
        const trimmed = data.slice(-3);
        window.localStorage.setItem(key, JSON.stringify(trimmed));
      }
    } catch (e) {
      // Catch quota errors gracefully
    }
  }
};

const usePersistentState = <T extends unknown>(key: string, initialValue: T) => {
  const [state, setState] = useState<T>(() => safeGetStorage(key, initialValue));

  useEffect(() => {
    safeSetStorage(key, state);
  }, [key, state]);

  return [state, setState] as const;
};

const TRANSLATIONS = {
  en: {
    workspace: "Workspace", directive: "Creative Directive", initiate: "Synthesize Matrix",
    foundry: "Foundry", stream: "Asset Stream", manual: "Manual (Base)", agent: "Agent (Director)",
    consilium: "Consilium (Experts)", symposium: "Symposium (Debate)", live: "Live Voice",
    settings: "Settings", resolution: "Resolution", format: "Export Format",
    newProject: "New Project", newFolder: "New Folder", refining: "Refining Prompt...",
    assets: "Input Assets", noAssets: "No assets linked", enterName: "Enter name:",
    ready: "Ready", activeVoice: "Speech Link active. Speak to brainstorm prompts, then click 'Synthesize Matrix' to generate!"
  },
  ru: {
    workspace: "Рабочее пространство", directive: "Креативная директива", initiate: "Синтезировать матрицу",
    foundry: "Кузница", stream: "Поток ассетов", manual: "Ручной (База)", agent: "Агент (Директор)",
    consilium: "Консилиум (Эксперты)", symposium: "Симпозиум (Дебаты)", live: "Live Голос",
    settings: "Настройки", resolution: "Разрешение", format: "Формат экспорта",
    newProject: "Новый проект", newFolder: "Новая папка", refining: "Улучшение промта...",
    assets: "Входные ассеты", noAssets: "Ассеты не добавлены", enterName: "Введите название:",
    ready: "Готово", activeVoice: "Голосовой канал активен. Говорите для подбора промта, затем нажмите «Синтезировать матрицу» для создания картинки!"
  }
};

export default function App() {
  const { showApiKeyDialog, setShowApiKeyDialog, handleApiKeyDialogContinue } = useApiKey();
  const [mode, setMode] = useState<AppMode>('MANUAL');
  const [theme, setTheme] = useState<AppTheme>('DARK');
  const [lang, setLang] = useState<Language>('ru');
  const [resolution, setResolution] = useState<Resolution>('1:1');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'CONTROLS' | 'LIBRARY'>('CONTROLS');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = usePersistentState<GenerationResult[]>('im-composer-history', []);
  const [prompt, setPrompt] = useState('');
  const [worldContext, setWorldContext] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [agentLog, setAgentLog] = usePersistentState<AgentStep[]>('im-composer-agentLog', []);
  const [symposiumData, setSymposiumData] = useState<{debate: SymposiumDebate[], solutions: string[]} | null>(null);
  const [consiliumData, setConsiliumData] = useState<ConsiliumExpert[]>([]);

  // Post-processing & Image Editor overlay states
  const [pendingGeneratedImage, setPendingGeneratedImage] = useState<{
    url: string;
    prompt: string;
    mode: AppMode;
    projectId: string;
  } | null>(null);
  const [editingHistoryItem, setEditingHistoryItem] = useState<GenerationResult | null>(null);

  // Custom AI Providers dialog state
  const [showProvidersDialog, setShowProvidersDialog] = useState(false);
  const [activeProviderName, setActiveProviderName] = useState(() => getActiveProvider().name);

  // Workspace
  const [folders, setFolders] = usePersistentState<Folder[]>('im-composer-folders', [{ id: 'f1', name: 'General', timestamp: Date.now() }]);
  const [projects, setProjects] = usePersistentState<Project[]>('im-composer-projects', [{ id: 'default', name: 'Main Project', timestamp: Date.now(), folderId: 'f1' }]);
  const [activeProject, setActiveProject] = usePersistentState<string>('im-composer-activeProject', 'default');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['f1']));

  // Live voice dialogue states
  const [isListening, setIsListening] = useState(false);
  const [liveChat, setLiveChat] = usePersistentState<{role: 'user' | 'model', text: string}[]>('im-composer-liveChat', [
    { role: 'model', text: 'Привет! Я твой ИИ-партнер по брейншторму. Давай создадим концепцию. Нажми кнопку микрофона и говори, либо просто напиши свою мысль ниже!' }
  ]);
  const [liveTextInput, setLiveTextInput] = useState('');
  const [isLiveProcessing, setIsLiveProcessing] = useState(false);
  const [showMobileWorkspace, setShowMobileWorkspace] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isLiveProcessingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // QEM Hybrid Local Intelligence and Speech Synthesis settings
  const [ttsEngine, setTtsEngine] = usePersistentState<'GEMINI' | 'BROWSER'>('im-composer-tts-engine', 'BROWSER');
  const [brainstormEngine, setBrainstormEngine] = usePersistentState<'GEMINI' | 'LOCAL'>('im-composer-brainstorm-engine', 'LOCAL');

  // Handle saving post-processed / cropped image
  const handleSavePendingImage = (finalEditedUrl: string) => {
    if (!pendingGeneratedImage) return;
    const newGen: GenerationResult = {
      id: Math.random().toString(36).substr(2, 9),
      url: finalEditedUrl,
      prompt: pendingGeneratedImage.prompt,
      timestamp: Date.now(),
      mode: pendingGeneratedImage.mode,
      projectId: pendingGeneratedImage.projectId,
    };
    setHistory(prev => [newGen, ...prev]);
    setPendingGeneratedImage(null);
    setAgentLog(prev => [...prev, { type: 'RESULT', content: 'Graded composition saved to project stream.', timestamp: Date.now() }]);
  };

  const handleSkipPendingImage = () => {
    if (!pendingGeneratedImage) return;
    const newGen: GenerationResult = {
      id: Math.random().toString(36).substr(2, 9),
      url: pendingGeneratedImage.url,
      prompt: pendingGeneratedImage.prompt,
      timestamp: Date.now(),
      mode: pendingGeneratedImage.mode,
      projectId: pendingGeneratedImage.projectId,
    };
    setHistory(prev => [newGen, ...prev]);
    setPendingGeneratedImage(null);
  };

  const handleSaveEditingHistoryItem = (editedUrl: string) => {
    if (!editingHistoryItem) return;
    const updatedGen: GenerationResult = {
      id: Math.random().toString(36).substr(2, 9),
      url: editedUrl,
      prompt: `${editingHistoryItem.prompt} (Graded)`,
      timestamp: Date.now(),
      mode: editingHistoryItem.mode,
      projectId: editingHistoryItem.projectId || activeProject,
    };
    setHistory(prev => [updatedGen, ...prev]);
    setEditingHistoryItem(null);
  };

  // Workspace report markdown exporter
  const exportWorkspaceToMarkdown = useCallback(() => {
    let md = `# IM COMPOSER FOUNDRY WORKSPACE REPORT\n`;
    md += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    md += `## PROJECTS & SPACE\n`;
    projects.forEach(p => {
      md += `### Project: ${p.name} ${p.id === activeProject ? '(Active)' : ''}\n`;
      const projFolders = folders.filter(f => f.projectId === p.id);
      projFolders.forEach(f => {
        md += `- Folder: ${f.name}\n`;
      });
      const projGen = history.filter(h => h.projectId === p.id);
      md += `- Generated Assets Count: ${projGen.length}\n\n`;
    });

    md += `## ACTIVE COMPOSITION PROMPT\n`;
    md += `\`\`\`\n${prompt || 'No active prompt.'}\n\`\`\`\n\n`;

    if (worldContext) {
      md += `## WORLD CONTEXT\n`;
      md += `\`\`\`\n${worldContext}\n\`\`\`\n\n`;
    }

    md += `## LIVE BRAINSTORM DIALOGUE\n`;
    liveChat.forEach(c => {
      md += `**[${c.role.toUpperCase()}]**: ${c.text}\n\n`;
    });

    md += `## SYSTEM LOGS & AGENT DIRECTIVES\n`;
    agentLog.forEach(log => {
      md += `\`[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type}]\` ${log.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `im-composer-workspace-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setAgentLog(prev => [...prev, { type: 'RESULT', content: 'SYSTEM: Markdown Workspace Report exported successfully!', timestamp: Date.now() }]);
  }, [projects, folders, activeProject, history, prompt, worldContext, liveChat, agentLog, setAgentLog]);

  // Auto-scroll the chat log
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [liveChat]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
      
      rec.onstart = () => {
        setIsListening(true);
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'SYSTEM: Microphone active. Listening...', timestamp: Date.now() }]);
      };
      
      rec.onend = () => {
        setIsListening(false);
      };
      
      rec.onerror = (event: any) => {
        console.warn("Speech recognition error", event.error);
        setIsListening(false);
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: `SYSTEM: Microphone input: ${event.error}`, timestamp: Date.now() }]);
      };
      
      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch (e) {}
          }
          handleLiveInput(transcript);
        }
      };
      recognitionRef.current = rec;
    }
  }, [lang]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'SYSTEM: Speech recognition not supported in this environment. Please type in the brainstorm chat instead!', timestamp: Date.now() }]);
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel(); // Stop current text-to-speech feedback
      }
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleLiveInput = async (userInput: string) => {
    if (!userInput.trim() || isLiveProcessingRef.current) return;
    isLiveProcessingRef.current = true;
    setIsLiveProcessing(true);
    
    // Slice chat history to keep it fast and prevent API context bloating/corruption
    const historySlice = liveChat.slice(-10);
    
    setLiveChat(prev => [...prev, { role: 'user', text: userInput }]);
    setAgentLog(prev => [...prev, { type: 'ACTION', content: `LIVE Speech: "${userInput}"`, timestamp: Date.now() }]);
    
    try {
      const response = await getLiveBrainstormResponse(userInput, historySlice, brainstormEngine);
      
      // Parse QEM Agent Actions
      const actions = response.speech.match(/\[ACTION:\s*([A-Z_]+)\s*(.*?)\]/g);
      if (actions) {
        actions.forEach((act: string) => {
          const m = act.match(/\[ACTION:\s*([A-Z_]+)\s*(.*?)\]/);
          if (m) {
            const command = m[1];
            const arg = m[2]?.trim().replace(/^"|"$/g, '');
            console.log("QEM Agent Executor executing action:", command, "with arg:", arg);
            
            if (command === 'SET_THEME') {
              if (['DARK', 'LIGHT', 'GOLDEN'].includes(arg)) {
                setTheme(arg as any);
              }
            } else if (command === 'SET_MODE') {
              if (['MANUAL', 'AGENT', 'CONSILIUM', 'SYMPOSIUM', 'LIVE'].includes(arg)) {
                setMode(arg as any);
              }
            } else if (command === 'SET_PROMPT') {
              if (arg) setPrompt(arg);
            } else if (command === 'EXPORT_MD') {
              setTimeout(() => {
                exportWorkspaceToMarkdown();
              }, 1200);
            }
          }
        });
      }

      setLiveChat(prev => [...prev, { role: 'model', text: response.speech }]);
      setPrompt(response.suggestedPrompt);
      setAgentLog(prev => [...prev, { type: 'RESULT', content: `LIVE: Suggested prompt updated to "${response.suggestedPrompt}"`, timestamp: Date.now() }]);
      
      const playTTS = async () => {
        if (ttsEngine === 'BROWSER') {
          fallbackSpeechSynthesis(response.speech);
          return;
        }
        try {
          const audioB64 = await generateSpeech(response.speech);
          const audioUrl = `data:audio/mp3;base64,${audioB64}`;
          const audio = new Audio(audioUrl);
          await audio.play();
        } catch (ttsErr) {
          console.warn("Gemini TTS playback failed, falling back to browser speech synthesis:", ttsErr);
          fallbackSpeechSynthesis(response.speech);
        }
      };

      const fallbackSpeechSynthesis = (text: string) => {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const cleanSpoken = text.replace(/\[ACTION:[^\]]+\]/g, '').trim();
          const utterance = new SpeechSynthesisUtterance(cleanSpoken);
          utterance.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
          window.speechSynthesis.speak(utterance);
        }
      };

      // Speak the brainstorm response
      playTTS();
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('403') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.status === 429) {
        setShowApiKeyDialog(true);
      }
      setAgentLog(prev => [...prev, { type: 'THOUGHT', content: `LIVE Brainstorm error: ${e.message}`, timestamp: Date.now() }]);
    } finally {
      isLiveProcessingRef.current = false;
      setIsLiveProcessing(false);
    }
  };

  // EMERGENCY TIMEOUT: If generation takes > 45s, unlock UI
  useEffect(() => {
    let timeout: any;
    if (isGenerating) {
      timeout = setTimeout(() => {
        setIsGenerating(false);
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'SYSTEM: Task timeout. UI unlocked.', timestamp: Date.now() }]);
      }, 45000);
    }
    return () => clearTimeout(timeout);
  }, [isGenerating]);


  const handleCreateFolder = () => {
    const name = window.prompt(t.enterName);
    if (name) {
      setFolders(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name, timestamp: Date.now() }]);
    }
  };

  const handleCreateProject = (folderId: string) => {
    const name = window.prompt(t.enterName);
    if (name) {
      const newId = Math.random().toString(36).substr(2, 9);
      setProjects(prev => [...prev, { id: newId, name, timestamp: Date.now(), folderId }]);
      setActiveProject(newId);
    }
  };

  const t = TRANSLATIONS[lang];

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url; link.download = `${filename}.${format}`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleRefine = async () => {
    if (!prompt || isRefining) return;
    setIsRefining(true);
    try {
      const enhanced = await refinePrompt(prompt);
      setPrompt(enhanced);
    } catch (e: any) { 
      console.error(e); 
      if (e.message?.includes('403') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.status === 429) {
        setShowApiKeyDialog(true);
      }
    } 
    finally { setIsRefining(false); }
  };

  const handleCompose = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const startLog = { type: 'THOUGHT' as const, content: 'Initiating neural synthesis...', timestamp: Date.now() };
    setAgentLog([startLog]);

    try {
      let finalUrl = "";
      if (mode === 'AGENT') {
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'AGENT: Initiating Autonomous Production Plan...', timestamp: Date.now() }]);
        
        // Fetch customized design steps
        const steps = await getAgentPlan(prompt);
        for (const step of steps) {
          setAgentLog(prev => [...prev, { type: 'ACTION', content: `AGENT: ${step}`, timestamp: Date.now() }]);
          await new Promise(r => setTimeout(r, 600));
        }

        const research = await agentResearch(prompt);
        setAgentLog(prev => [...prev, { type: 'ACTION', content: `AGENT: Researching trend references: "${research.text.slice(0, 100)}..."`, timestamp: Date.now() }]);
        
        const res = await generateImage(
          `Creative Director Plan executed. Campaign goals: ${prompt}. Visual elements: ${research.text}`, 
          resolution, 
          worldContext, 
          assets.map(a => a.content), 
          true
        );
        finalUrl = res.url;
      } else if (mode === 'SYMPOSIUM') {
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'SYMPOSIUM: Gathering Master, Mentor and Student for dialectic debate...', timestamp: Date.now() }]);
        const data = await runSymposiumDebate(prompt);
        setSymposiumData(data);
        
        // Stagger the debate logs to look active
        for (const msg of data.debate) {
          setAgentLog(prev => [...prev, { type: 'ACTION', content: `[${msg.role}]: ${msg.message}`, timestamp: Date.now() }]);
          await new Promise(r => setTimeout(r, 500));
        }
        
        const res = await generateImage(data.solutions[0] || prompt, resolution, worldContext, assets.map(a => a.content));
        finalUrl = res.url;
      } else if (mode === 'CONSILIUM') {
        setAgentLog(prev => [...prev, { type: 'THOUGHT', content: 'CONSILIUM: Seeking reports from Architect, Stylist and Harmonizer experts...', timestamp: Date.now() }]);
        const data = await getConsiliumFeedback(prompt);
        setConsiliumData(data);
        
        for (const exp of data) {
          setAgentLog(prev => [...prev, { type: 'ACTION', content: `CONSILIUM [${exp.expert}]: Critique - ${exp.critique}`, timestamp: Date.now() }]);
        }
        
        const res = await generateImage(data[0]?.improvedPrompt || prompt, resolution, worldContext, assets.map(a => a.content));
        finalUrl = res.url;
      } else if (mode === 'LIVE') {
        const res = await generateImage(prompt, resolution, worldContext, assets.map(a => a.content));
        finalUrl = res.url;
      } else {
        // MANUAL MODE: Seamless balance of light, shadows and perspective
        const enrichedPrompt = assets.length > 0 
          ? `Seamlessly integrate the uploaded input asset images into a single professional, photorealistic composition. Ensure perfect light matching, realistic shadows, correct depth of field, and perfect perspective projection based on this directive: ${prompt}`
          : prompt;
        const res = await generateImage(enrichedPrompt, resolution, worldContext, assets.map(a => a.content));
        finalUrl = res.url;
      }

      // Automatically trigger image editing & grading overlay before committing to project history
      setPendingGeneratedImage({
        url: finalUrl,
        prompt,
        mode,
        projectId: activeProject,
      });
      setAgentLog(prev => [...prev, { type: 'RESULT', content: 'Synthesis complete. Ready for framing and color grading.', timestamp: Date.now() }]);
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.status === 429) {
        setShowApiKeyDialog(true);
      }
      setAgentLog(prev => [...prev, { type: 'THOUGHT', content: `CRITICAL: ${e.message}`, timestamp: Date.now() }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const projectHistory = history.filter(h => h.projectId === activeProject);
  const accentColor = theme === 'GOLDEN' ? '#E5B15E' : '#FF853E';
  const sidebarColor = theme === 'LIGHT' ? 'bg-[#EAEAE2] border-zinc-200' : 'bg-[#070707] border-zinc-800';
  const panelColor = theme === 'LIGHT' ? 'bg-white border-zinc-200' : 'bg-[#050505] border-zinc-800';

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors duration-500 overflow-hidden relative ${theme === 'LIGHT' ? 'bg-[#F2F2EB] text-zinc-900' : 'bg-[#0A0A0A] text-zinc-100'}`}>
      
      {showApiKeyDialog && <ApiKeyDialog onContinue={handleApiKeyDialogContinue} onClose={() => setShowApiKeyDialog(false)} />}

      {fullscreenImage && (
        <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-8 backdrop-blur-2xl animate-fade-in" onClick={() => setFullscreenImage(null)}>
           <button className="absolute top-8 right-8 text-white/50 hover:text-white"><X size={32}/></button>
           <img src={fullscreenImage} className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()}/>
           <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <button onClick={() => handleDownload(fullscreenImage, 'asset')} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center gap-2 border border-white/10 text-xs font-semibold"><Download size={16}/> Download</button>
              <button onClick={() => {
                const found = history.find(item => item.url === fullscreenImage);
                setEditingHistoryItem(found || { id: 'temp', url: fullscreenImage, prompt: prompt || 'Graded asset', timestamp: Date.now(), mode: mode });
                setFullscreenImage(null);
              }} className="px-6 py-3 bg-[#FF853E] hover:bg-[#ff7320] text-black rounded-full flex items-center gap-2 text-xs font-bold shadow-lg"><Crop size={16}/> Редактировать / Кадрировать</button>
           </div>
        </div>
      )}

      {/* HEADER */}
      <header className={`h-16 border-b flex items-center justify-between px-4 md:px-6 z-[100] relative shadow-lg shrink-0 ${theme === 'LIGHT' ? 'bg-white border-zinc-200' : 'bg-[#050505] border-zinc-800'}`}>
        <div className="flex items-center gap-4 md:gap-6">
          <button onClick={() => setShowMobileWorkspace(!showMobileWorkspace)} className="md:hidden p-2 text-zinc-500 hover:text-white transition-colors">
            <Menu size={22}/>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded flex items-center justify-center text-black shadow-lg" style={{ backgroundColor: accentColor }}><Box size={20} strokeWidth={3} /></div>
            <div className="flex flex-col -space-y-1">
              <span className="font-black text-lg md:text-2xl tracking-tighter uppercase italic">IM Composer</span>
              <span className="text-[8px] md:text-[9px] font-bold tracking-[0.4em] opacity-40 uppercase">Foundry v3.2</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setShowProvidersDialog(true)} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
            title="Настройка ИИ провайдеров и API ключей"
          >
            <KeyRound size={14} className="text-[#FF853E]" />
            <span className="hidden sm:inline text-[11px] font-bold">ИИ Провайдеры</span>
          </button>
          <button onClick={() => setLang(lang === 'en' ? 'ru' : 'en')} className="text-[10px] font-black uppercase text-zinc-500 hover:text-white">{lang.toUpperCase()}</button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-zinc-500 hover:text-white transition-colors"><Settings size={22}/></button>
          <button onClick={() => setTheme(theme === 'DARK' ? 'LIGHT' : theme === 'LIGHT' ? 'GOLDEN' : 'DARK')} className="p-2 text-zinc-500 hover:text-white transition-colors">{theme === 'DARK' ? <Moon size={22}/> : <Sun size={22}/>}</button>
        </div>
      </header>

      {/* SETTINGS */}
      {showSettings && (
        <div className="fixed top-20 right-6 w-80 glass-panel border border-zinc-700/50 rounded-2xl p-6 z-[200] animate-fade-in shadow-2xl">
           <div className="flex justify-between items-center mb-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{t.settings}</h4>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white"><X size={18}/></button>
           </div>
           <div className="space-y-6">
              <div className="space-y-3">
                 <label className="text-[9px] font-bold text-zinc-600 block">{t.resolution}</label>
                 <div className="grid grid-cols-3 gap-2">
                    {(['1:1', '16:9', '9:16', '4:3', '3:4'] as Resolution[]).map(r => (
                      <button key={r} onClick={() => setResolution(r)} className={`p-2 border rounded text-[10px] font-black ${resolution === r ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>{r}</button>
                    ))}
                 </div>
              </div>
              <div className="space-y-3">
                 <label className="text-[9px] font-bold text-zinc-600 block">{t.format}</label>
                 <div className="grid grid-cols-2 gap-2">
                    {(['png', 'jpeg', 'webp'] as ExportFormat[]).map(f => (
                      <button key={f} onClick={() => setFormat(f)} className={`p-2 border rounded text-[10px] font-black uppercase ${format === f ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>{f}</button>
                    ))}
                 </div>
              </div>
              <div className="space-y-3 pt-3 border-t border-zinc-800/20">
                 <label className="text-[9px] font-bold text-zinc-600 block">Brainstorm LLM Engine</label>
                 <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setBrainstormEngine('GEMINI')} className={`p-2 border rounded text-[9px] font-black uppercase ${brainstormEngine === 'GEMINI' ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>Cloud Gemini</button>
                    <button onClick={() => setBrainstormEngine('LOCAL')} className={`p-2 border rounded text-[9px] font-black uppercase ${brainstormEngine === 'LOCAL' ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>Local / Free</button>
                 </div>
              </div>
              <div className="space-y-3">
                 <label className="text-[9px] font-bold text-zinc-600 block">Voice Synthesizer (TTS)</label>
                 <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setTtsEngine('GEMINI')} className={`p-2 border rounded text-[9px] font-black uppercase ${ttsEngine === 'GEMINI' ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>Gemini Hi-Fi</button>
                    <button onClick={() => setTtsEngine('BROWSER')} className={`p-2 border rounded text-[9px] font-black uppercase ${ttsEngine === 'BROWSER' ? 'border-[#FF853E] text-[#FF853E]' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 transition-colors'}`}>Local Browser</button>
                 </div>
              </div>
              <div className="pt-4 border-t border-zinc-800/50 space-y-2">
                 <button onClick={() => { setShowSettings(false); setShowProvidersDialog(true); }} className="w-full p-3 border border-[#FF853E]/40 bg-[#FF853E]/10 hover:bg-[#FF853E]/20 text-[#FF853E] hover:text-white rounded-xl text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2">
                    <KeyRound size={14}/> Настроить ИИ Провайдеров и Ключи
                 </button>
                 <button onClick={exportWorkspaceToMarkdown} className="w-full p-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-xl text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2">
                    <Download size={14}/> Export Workspace Report (.md)
                 </button>
                 <button onClick={() => { setAgentLog([]); setLiveChat([]); }} className="w-full p-3 border border-red-900/30 text-red-500 bg-red-900/10 hover:bg-red-900/20 rounded-xl text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-2">
                    <Trash2 size={14}/> Clear Agent Memory
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* SIDEBAR */}
        <aside className={`absolute md:relative z-40 h-full w-72 border-r flex flex-col transition-transform duration-300 ${showMobileWorkspace ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${sidebarColor}`}>
          <div className="p-6 space-y-8 overflow-y-auto scrollbar-hide flex-1">
            <div className="space-y-4">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Operating Mode</span>
               <div className="flex flex-col gap-1.5">
                  {(['MANUAL', 'AGENT', 'CONSILIUM', 'SYMPOSIUM', 'LIVE'] as AppMode[]).map(m => (
                    <button key={m} onClick={() => {setMode(m); setShowMobileWorkspace(false);}} className={`w-full text-left px-4 py-3 text-[10px] font-black rounded-lg uppercase transition-all flex items-center justify-between ${mode === m ? 'text-black shadow-lg' : 'text-zinc-500 hover:text-white bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700'}`} style={mode === m ? { backgroundColor: accentColor } : {}}>
                      <span>{t[m.toLowerCase() as keyof typeof t] || m}</span>
                      {mode === m && <Zap size={14}/>}
                    </button>
                  ))}
               </div>
            </div>

            <div className="pt-4 border-t border-zinc-800/50">
               <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">{t.workspace}</span>
                  <div className="flex gap-2">
                    <button onClick={handleCreateFolder} className="p-1.5 hover:text-[#FF853E] transition-colors"><FolderPlus size={14}/></button>
                  </div>
               </div>
               <div className="space-y-2">
              {folders.map(folder => (
                <div key={folder.id} className="space-y-1">
                  <div className="flex items-center justify-between px-3 py-2 text-[10px] font-black uppercase text-zinc-500 bg-zinc-900/20 rounded border border-white/5">
                    <div className="flex items-center gap-2"><FolderIcon size={14}/> {folder.name}</div>
                    <button onClick={() => handleCreateProject(folder.id)} className="p-1 hover:text-[#FF853E] cursor-pointer"><Plus size={12}/></button>
                  </div>
                  <div className="pl-4 space-y-1">
                    {projects.filter(p => p.folderId === folder.id).map(project => (
                      <button key={project.id} onClick={() => setActiveProject(project.id)} className={`w-full text-left px-3 py-2 rounded text-[11px] font-bold ${activeProject === project.id ? 'text-[#FF853E] bg-[#FF853E]/10' : 'text-zinc-600'}`}>{project.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </div>

            <div className="pt-4 border-t border-zinc-800/50 space-y-4">
              <span className="text-[10px] font-black uppercase text-[#FF853E] flex items-center gap-2"><Terminal size={14}/> Console</span>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {agentLog.map((log, i) => (
                  <div key={i} className={`p-3 rounded border text-[10px] font-mono leading-tight ${log.type === 'RESULT' ? 'text-green-400' : 'text-zinc-500'} bg-zinc-900 border-zinc-800`}>
                    {log.content}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* FEED AREA */}
        <main className="flex-1 relative flex flex-col min-h-0 md:overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,133,62,0.02)_0%,transparent_80%)]">
           <div className="flex-1 p-6 md:p-12 overflow-y-auto scrollbar-hide z-10 pb-24 md:pb-12">
              {activeTab === 'LIBRARY' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8 animate-fade-in">
                  {projectHistory.map(h => (
                    <div key={h.id} className="group relative bg-black/40 border border-zinc-800 rounded-xl overflow-hidden hover:border-[#FF853E] transition-all">
                       <img src={h.url} className="w-full aspect-square object-cover" />
                       <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-center items-center gap-4">
                          <div className="flex items-center gap-2">
                             <button onClick={() => setFullscreenImage(h.url)} className="p-3 bg-white/10 hover:bg-[#FF853E] hover:text-black rounded-full text-white" title="На весь экран"><Maximize2 size={22}/></button>
                             <button onClick={() => setEditingHistoryItem(h)} className="p-3 bg-white/10 hover:bg-[#FF853E] hover:text-black rounded-full text-white" title="Редактировать / Кадрировать"><Crop size={22}/></button>
                          </div>
                          <button onClick={() => setPrompt(h.prompt)} className="px-4 py-2 bg-white/10 text-white text-[10px] uppercase rounded">Reuse</button>
                       </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col gap-16 overflow-y-auto items-center py-4">
                   {projectHistory.length > 0 ? (
                      projectHistory.map((h, i) => (
                        <div key={h.id} className="relative max-w-4xl group animate-fade-in flex-shrink-0">
                           <div className="absolute -left-16 top-0 h-full flex flex-col items-center gap-4 opacity-30">
                              <span className="text-[11px] font-black uppercase vertical-text tracking-[0.5em] text-[#FF853E]">{i === 0 ? 'LATEST' : `#${projectHistory.length - i}`}</span>
                              <div className="flex-1 w-[2px] bg-gradient-to-b from-[#FF853E] to-transparent"></div>
                           </div>
                           <img src={h.url} className="max-h-[80vh] rounded-3xl shadow-2xl border border-white/5 cursor-zoom-in" onClick={() => setFullscreenImage(h.url)}/>
                           <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex gap-4 p-2 bg-black/90 backdrop-blur-2xl border border-zinc-800 rounded-full opacity-0 group-hover:opacity-100 transition-all z-20">
                              <button onClick={() => handleDownload(h.url, 'foundry')} className="px-8 py-3.5 bg-[#FF853E] text-black text-[11px] font-black uppercase rounded-full flex items-center gap-2">Download</button>
                              <button onClick={() => setEditingHistoryItem(h)} className="px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-black uppercase rounded-full flex items-center gap-2"><Crop size={14}/> Редактировать</button>
                              <button onClick={() => setPrompt(h.prompt)} className="px-8 py-4 text-zinc-400 hover:text-white text-[11px] font-black uppercase">Reuse</button>
                           </div>
                        </div>
                      ))
                   ) : (
                      <div className="flex flex-col items-center opacity-10 grayscale mt-32">
                         <Box size={160} strokeWidth={0.3} />
                         <h2 className="text-6xl font-black italic tracking-tighter mt-8 uppercase">Neural Foundry</h2>
                         <p className="text-[12px] font-black uppercase tracking-[0.8em] mt-3">Awaiting Synthesis</p>
                      </div>
                   )}
                </div>
              )}
           </div>

           <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/80 backdrop-blur-3xl border border-white/10 p-1 rounded-xl shadow-2xl z-50">
             <button onClick={() => setActiveTab('CONTROLS')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'CONTROLS' ? 'bg-[#FF853E] text-black shadow-md scale-105' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.foundry}</button>
             <button onClick={() => setActiveTab('LIBRARY')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'LIBRARY' ? 'bg-[#FF853E] text-black shadow-md scale-105' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.stream}</button>
          </div>
        </main>

        {/* RIGHT SIDEBAR / CONTROLS */}
        <aside className={`w-full md:w-80 lg:w-[400px] border-t md:border-t-0 md:border-l flex flex-col ${panelColor} z-20 transition-all shrink-0 md:h-full`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 scrollbar-hide">
             
             {mode === 'LIVE' ? (
                /* LIVE MODE VOICE HUB */
                <div className="space-y-6 flex flex-col h-full justify-between">
                   <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF853E] flex items-center gap-2"><Activity className="animate-pulse" size={14}/> LIVE BRAINSTORM HUB</span>
                        <button 
                           onClick={() => setLiveChat([
                             { role: 'model', text: lang === 'ru' ? 'Привет! Я твой ИИ-партнер по брейншторму. Давай создадим концепцию. Нажми кнопку микрофона и говори, либо просто напиши свою мысль ниже!' : 'Hello! I am your AI brainstorming partner. Let\'s build a concept together!' }
                           ])}
                           title={lang === 'ru' ? 'Очистить историю брейншторма' : 'Clear brainstorm history'}
                           className="p-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded-lg text-zinc-500 hover:text-red-500 transition-all flex items-center justify-center animate-fade-in"
                         >
                           <Trash2 size={12}/>
                         </button>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed italic">{t.activeVoice}</p>
                      
                      {/* Audio visualizer wave */}
                      <div className="h-28 bg-zinc-950/50 rounded-2xl border border-zinc-900 flex items-center justify-center relative overflow-hidden group">
                         <div className="absolute inset-0 bg-gradient-to-r from-[#FF853E]/5 to-transparent"></div>
                         <div className="flex items-center gap-1.5 z-10">
                            {[...Array(14)].map((_, idx) => (
                               <div 
                                 key={idx} 
                                 className="w-1.5 bg-[#FF853E] rounded-full transition-all duration-300"
                                 style={{ 
                                   height: isListening 
                                     ? `${Math.random() * 60 + 20}px` 
                                     : isLiveProcessing 
                                       ? `${Math.random() * 40 + 10}px` 
                                       : '12px',
                                   opacity: isListening ? 1 : 0.4
                                 }}
                               />
                            ))}
                         </div>
                         {isListening && (
                            <span className="absolute bottom-3 text-[9px] uppercase tracking-[0.2em] text-[#FF853E] animate-pulse">listening...</span>
                         )}
                      </div>
                   </div>

                   {/* Dialogue Stream */}
                   <div ref={chatContainerRef} className="flex-1 bg-zinc-950/20 rounded-2xl border border-zinc-900/60 p-4 overflow-y-auto max-h-[300px] space-y-3 scrollbar-hide font-mono text-[11px]">
                      {liveChat.map((msg, i) => (
                         <div key={i} className={`p-3.5 rounded-xl border w-fit max-w-[90%] ${msg.role === 'user' ? 'bg-zinc-900 border-zinc-800 text-zinc-300 ml-auto' : 'bg-[#FF853E]/5 border-[#FF853E]/10 text-[#FF853E] mr-auto'}`}>
                            <div className="text-[9px] uppercase font-black opacity-50 mb-1">{msg.role === 'user' ? 'YOU' : 'AI'}</div>
                            <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</div>
                         </div>
                      ))}
                      {isLiveProcessing && (
                         <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-900/80 text-zinc-500 animate-pulse flex items-center gap-2 w-fit max-w-[90%]">
                            <Loader2 size={12} className="animate-spin"/> Brainstorming creative responses...
                         </div>
                      )}
                   </div>

                   {/* Controls and keyboard input */}
                   <div className="space-y-4 pt-4 border-t border-zinc-900">
                      <div className="flex gap-3">
                         <button 
                           onClick={toggleListening} 
                           className={`flex-1 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 transition-all ${isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}
                         >
                            {isListening ? <MicOff size={16}/> : <Mic size={16}/>}
                            {isListening ? "Mute Microphone" : "Activate Speech Link"}
                         </button>
                      </div>

                      {/* Manual speech text input fallback */}
                      <div className="relative">
                         <input 
                           type="text" 
                           value={liveTextInput}
                           onChange={(e) => setLiveTextInput(e.target.value)}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                               handleLiveInput(liveTextInput);
                               setLiveTextInput('');
                             }
                           }}
                           placeholder="Type to brainstorm or speak..."
                           className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-[12px] font-mono pr-12 focus:outline-none focus:border-[#FF853E]"
                         />
                         <button 
                           onClick={() => {
                             if (liveTextInput.trim()) {
                               handleLiveInput(liveTextInput);
                               setLiveTextInput('');
                             }
                           }}
                           className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                         >
                            <Send size={14}/>
                         </button>
                      </div>
                   </div>
                </div>
             ) : (
                /* MANUAL, AGENT, CONSILIUM, SYMPOSIUM CONTROLS */
                <>
                   {/* ASSETS SECTION */}
                   <section className="space-y-6">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{t.assets}</span>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                         <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 hover:border-[#FF853E] cursor-pointer relative bg-zinc-900/40">
                            <Plus size={36}/>
                            <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => {
                               const file = e.target.files?.[0]; if(file) {
                                 const reader = new FileReader(); reader.onload = (re) => setAssets([{ id: Date.now().toString(), type: 'image', content: re.target?.result as string, name: file.name, timestamp: Date.now() }, ...assets]); reader.readAsDataURL(file);
                               }
                            }} />
                         </div>
                         {assets.map(a => (
                           <div key={a.id} className="w-24 h-24 rounded-2xl border border-zinc-800 overflow-hidden group relative flex-shrink-0">
                              <img src={a.content} className="w-full h-full object-cover" />
                              <button onClick={() => setAssets(assets.filter(x => x.id !== a.id))} className="absolute inset-0 bg-red-600/90 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"><Trash2 size={24}/></button>
                           </div>
                         ))}
                      </div>
                   </section>

                   {/* CREATIVE DIRECTIVE SECTION */}
                   <section className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">{t.directive}</label>
                        {isRefining && <span className="text-[9px] font-black text-[#FF853E] animate-pulse">Refining...</span>}
                      </div>
                      <div className="relative group">
                         <textarea 
                           value={prompt} 
                           onChange={(e) => setPrompt(e.target.value)} 
                           placeholder={
                             mode === 'AGENT' 
                               ? 'Поставьте задачу: например, "разработай три варианта упаковки для нового напитка"...' 
                               : mode === 'SYMPOSIUM'
                                 ? 'Введите сложную творческую дилемму: например, "обложка книги, которая одновременно винтажная и футуристическая"...'
                                 : mode === 'CONSILIUM'
                                   ? 'Опишите цель и загрузите ключевой актив для совета экспертов...'
                                   : 'Aesthetic directive...'
                           } 
                           className="w-full h-28 bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-4 text-[12px] font-mono leading-relaxed focus:outline-none focus:border-[#FF853E] transition-all resize-none text-zinc-200" 
                         />
                         <div className="absolute bottom-3 right-3 flex gap-2">
                            <button onClick={() => setPrompt('')} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-600 hover:text-white transition-colors"><RefreshCw size={14}/></button>
                            <button onClick={handleRefine} disabled={isRefining || !prompt} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-600 hover:text-[#FF853E] transition-colors">
                              {isRefining ? <Loader2 size={14} className="animate-spin text-[#FF853E]"/> : <Wand2 size={14}/>}
                            </button>
                         </div>
                      </div>
                   </section>

                   {/* RENDERING MODE INFORMATION */}
                   <section className="bg-zinc-950/30 border border-zinc-900/60 p-5 rounded-2xl space-y-2.5 font-sans">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#FF853E]">
                         <HelpCircle size={14}/>
                         <span>
                            {mode === 'MANUAL' && 'Ручной режим (база)'}
                            {mode === 'AGENT' && 'Агент (Креативный директор)'}
                            {mode === 'CONSILIUM' && 'Консилиум (Совет экспертов)'}
                            {mode === 'SYMPOSIUM' && 'Симпозиум (Дилеммы)'}
                         </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                         {mode === 'MANUAL' && 'Идеально для точного композиторства. Загрузите персонажей, фоны и предметы. ИИ соединит их, соблюдая направление света, тени и глубину резкости.'}
                         {mode === 'AGENT' && 'Автономный режим. Агент исследует тему, составит производственный план в реальном времени, сгенерирует недостающие активы и соберёт готовую сцену.'}
                         {mode === 'CONSILIUM' && 'Система собирает команду из Архитектора, Стилиста и Гармонизатора. Они подготовят профессиональные отчеты, которые вы можете сразу применить.'}
                         {mode === 'SYMPOSIUM' && 'Для сложных задач. Мастер, Ментор и Ученик проведут диалектический спор, чтобы предложить три концептуально выверенных мастер-промта.'}
                      </p>
                   </section>

                   {/* CONSILIUM REPORTS */}
                   {mode === 'CONSILIUM' && consiliumData.length > 0 && (
                      <div className="space-y-4 animate-fade-in pt-4 border-t border-zinc-900/60">
                         <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Reports from Experts</span>
                         {consiliumData.map((e, i) => (
                            <div key={i} className="p-5 bg-zinc-950/60 border-l-4 border-[#FF853E] rounded-r-3xl space-y-2.5 shadow-lg font-sans">
                               <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black uppercase text-[#FF853E]">{e.expert}</span>
                                  <span className="text-[8px] px-2 py-0.5 rounded bg-[#FF853E]/10 text-[#FF853E] font-bold">Specialist</span>
                               </div>
                               <p className="text-[12px] opacity-75 italic text-zinc-300">"{e.critique}"</p>
                               <button 
                                 onClick={() => {
                                   setPrompt(e.improvedPrompt);
                                   setAgentLog(prev => [...prev, { type: 'THOUGHT', content: `SYSTEM: Applied prompt suggestion from ${e.expert}`, timestamp: Date.now() }]);
                                 }} 
                                 className="text-[10px] uppercase flex items-center gap-2 text-zinc-500 hover:text-white mt-1.5 transition-colors font-sans"
                               >
                                  <Zap size={12}/> Apply Expert Directive
                               </button>
                            </div>
                         ))}
                      </div>
                   )}

                   {/* SYMPOSIUM DIALOGUE & SOLUTIONS */}
                   {mode === 'SYMPOSIUM' && symposiumData && (
                      <div className="space-y-4 animate-fade-in pt-4 border-t border-zinc-900/60 font-sans">
                         <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Theatrical Debate Transcript</span>
                         
                         <div className="max-h-56 overflow-y-auto space-y-3 p-4 bg-zinc-950/40 rounded-2xl border border-zinc-900/80 scrollbar-hide text-[11px] font-mono leading-relaxed">
                            {symposiumData.debate.map((msg, i) => (
                               <div key={i} className="space-y-1">
                                  <span className="text-[9px] font-black uppercase text-[#FF853E] block">
                                     {msg.role}
                                  </span>
                                  <p className="text-zinc-300 italic">"{msg.message}"</p>
                               </div>
                            ))}
                         </div>

                         <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 block mt-4">Synthesized Concepts</span>
                         <div className="space-y-2">
                            {symposiumData.solutions.map((sol, i) => (
                               <div key={i} className="p-4 bg-[#FF853E]/5 border border-[#FF853E]/10 rounded-2xl space-y-2 hover:border-[#FF853E]/30 transition-all">
                                  <span className="text-[9px] font-black uppercase text-[#FF853E]">Concept #{i+1}</span>
                                  <p className="text-[12px] text-zinc-300 line-clamp-2 leading-relaxed">{sol}</p>
                                  <button 
                                    onClick={() => {
                                      setPrompt(sol);
                                      setAgentLog(prev => [...prev, { type: 'THOUGHT', content: `SYSTEM: Selected concept #${i+1} as active directive.`, timestamp: Date.now() }]);
                                    }} 
                                    className="text-[9px] font-black uppercase text-[#FF853E] hover:underline flex items-center gap-1.5"
                                  >
                                     Use Concept <Zap size={10}/>
                                  </button>
                               </div>
                            ))}
                         </div>
                      </div>
                   )}
                </>
             )}
          </div>

          <div className="p-8 border-t border-zinc-800 bg-[#050505]">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                   <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_15px_#22c55e]"></div>
                   <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Neural Link: Online</span>
                </div>
                <span className="text-[10px] font-black text-[#FF853E] bg-[#FF853E]/10 px-4 py-1.5 rounded-full border border-[#FF853E]/20">{resolution}</span>
             </div>
             <button onClick={handleCompose} disabled={isGenerating || !prompt} className={`w-full py-3 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 text-[10px] ${isGenerating ? 'bg-zinc-900 text-zinc-700' : 'text-black shadow-lg hover:scale-[1.02]'}`} style={!isGenerating ? { backgroundColor: accentColor } : {}}>
                {isGenerating ? <Loader2 className="animate-spin" size={14}/> : <>{t.initiate} <Zap size={14} fill="black"/></>}
             </button>
          </div>
        </aside>
      </div>

      <footer className="h-14 border-t flex items-center px-10 justify-between relative bg-[#050505] border-zinc-900 z-[100]">
         <div className="flex gap-10 items-center">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div><span className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em]">Ready</span></div>
            <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-tighter">0.8ms</div>
         </div>
         <div className="text-[10px] font-black text-zinc-800 uppercase italic opacity-40 select-none tracking-widest">Composer Suite © 2025</div>
      </footer>

      {/* Image Editing & Grading Modal for newly synthesized generation */}
      {pendingGeneratedImage && (
        <ImageEditorModal
          isOpen={!!pendingGeneratedImage}
          imageUrl={pendingGeneratedImage.url}
          title="Кадрирование и цветокоррекция генерации"
          accentColor={accentColor}
          onClose={handleSkipPendingImage}
          onSave={handleSavePendingImage}
        />
      )}

      {/* Image Editing Modal for existing asset in history */}
      {editingHistoryItem && (
        <ImageEditorModal
          isOpen={!!editingHistoryItem}
          imageUrl={editingHistoryItem.url}
          title="Редактирование сохраненного ассета"
          accentColor={accentColor}
          onClose={() => setEditingHistoryItem(null)}
          onSave={handleSaveEditingHistoryItem}
        />
      )}

      {/* Custom AI Providers and API Keys Configuration Dialog */}
      <CustomProvidersDialog
        isOpen={showProvidersDialog}
        onClose={() => setShowProvidersDialog(false)}
        onProviderChanged={(p) => setActiveProviderName(p.name)}
      />
    </div>
  );
}
