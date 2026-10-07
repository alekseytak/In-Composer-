/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Check, RotateCw, FlipHorizontal, FlipVertical, Crop, Sliders, 
  Download, RefreshCw, Sun, Contrast, Palette, Eye, Sparkles
} from 'lucide-react';
import { ImageFilterSettings } from '../types';

interface ImageEditorModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (editedImageUrl: string) => void;
  title?: string;
  accentColor?: string;
}

const DEFAULT_FILTERS: ImageFilterSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  warmth: 0,
  hueRotate: 0,
  blur: 0,
  invert: 0,
};

type AspectPreset = 'free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  imageUrl,
  isOpen,
  onClose,
  onSave,
  title = 'Image Editing & Grading Suite',
  accentColor = '#FF853E',
}) => {
  const [activeTab, setActiveTab] = useState<'FILTERS' | 'CROP' | 'TRANSFORM'>('FILTERS');
  const [filters, setFilters] = useState<ImageFilterSettings>(DEFAULT_FILTERS);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');

  // Crop box state as normalized percentages [0, 100]
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset when dialog opens with new image
  useEffect(() => {
    if (isOpen) {
      setFilters(DEFAULT_FILTERS);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropBox({ x: 0, y: 0, width: 100, height: 100 });
      setAspectPreset('free');
    }
  }, [isOpen, imageUrl]);

  // Adjust crop box based on selected aspect ratio
  const applyAspectPreset = (preset: AspectPreset) => {
    setAspectPreset(preset);
    if (preset === 'free') {
      setCropBox({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }

    let targetRatio = 1;
    if (preset === '1:1') targetRatio = 1;
    else if (preset === '16:9') targetRatio = 16 / 9;
    else if (preset === '9:16') targetRatio = 9 / 16;
    else if (preset === '4:3') targetRatio = 4 / 3;
    else if (preset === '3:4') targetRatio = 3 / 4;

    if (targetRatio >= 1) {
      // Landscape or square
      const width = 90;
      const height = Math.min(90, Math.round(width / targetRatio));
      setCropBox({
        x: Math.round((100 - width) / 2),
        y: Math.round((100 - height) / 2),
        width,
        height,
      });
    } else {
      // Portrait
      const height = 90;
      const width = Math.min(90, Math.round(height * targetRatio));
      setCropBox({
        x: Math.round((100 - width) / 2),
        y: Math.round((100 - height) / 2),
        width,
        height,
      });
    }
  };

  const handleMouseDownCrop = (e: React.MouseEvent) => {
    setIsDraggingCrop(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
    });
  };

  const handleMouseMoveCrop = useCallback((e: MouseEvent) => {
    if (!isDraggingCrop || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStart.y) / rect.height) * 100;

    let newX = Math.max(0, Math.min(100 - cropBox.width, dragStart.boxX + deltaXPercent));
    let newY = Math.max(0, Math.min(100 - cropBox.height, dragStart.boxY + deltaYPercent));

    setCropBox(prev => ({ ...prev, x: newX, y: newY }));
  }, [isDraggingCrop, dragStart, cropBox.width, cropBox.height]);

  const handleMouseUpCrop = useCallback(() => {
    setIsDraggingCrop(false);
  }, []);

  useEffect(() => {
    if (isDraggingCrop) {
      window.addEventListener('mousemove', handleMouseMoveCrop);
      window.addEventListener('mouseup', handleMouseUpCrop);
      return () => {
        window.removeEventListener('mousemove', handleMouseMoveCrop);
        window.removeEventListener('mouseup', handleMouseUpCrop);
      };
    }
  }, [isDraggingCrop, handleMouseMoveCrop, handleMouseUpCrop]);

  // Compute CSS filter string
  const cssFilter = `
    brightness(${filters.brightness}%) 
    contrast(${filters.contrast}%) 
    saturate(${filters.saturation}%) 
    grayscale(${filters.grayscale}%) 
    sepia(${filters.sepia}%) 
    hue-rotate(${filters.hueRotate + filters.warmth * 0.8}deg)
  `.trim();

  // Export edited canvas
  const renderProcessedCanvas = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        // 1. Calculate source crop dimensions
        const cropX = (cropBox.x / 100) * img.naturalWidth;
        const cropY = (cropBox.y / 100) * img.naturalHeight;
        const cropW = (cropBox.width / 100) * img.naturalWidth;
        const cropH = (cropBox.height / 100) * img.naturalHeight;

        // Determine destination canvas dimensions based on rotation
        const isSwapped = rotation === 90 || rotation === 270;
        canvas.width = isSwapped ? cropH : cropW;
        canvas.height = isSwapped ? cropW : cropH;

        // Apply filters
        ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) hue-rotate(${filters.hueRotate + filters.warmth * 0.8}deg)`;

        // Setup transformation matrix
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

        // Draw cropped portion
        const drawW = isSwapped ? cropH : cropW;
        const drawH = isSwapped ? cropW : cropH;
        ctx.drawImage(
          img,
          cropX, cropY, cropW, cropH,
          -drawW / 2, -drawH / 2, drawW, drawH
        );
        ctx.restore();

        resolve(canvas.toDataURL('image/png', 0.95));
      };
      img.onerror = (e) => reject(e);
      img.src = imageUrl;
    });
  }, [imageUrl, filters, rotation, flipH, flipV, cropBox]);

  const handleSave = async () => {
    try {
      const resultDataUrl = await renderProcessedCanvas();
      onSave(resultDataUrl);
      onClose();
    } catch (e) {
      console.error('Failed to export edited image', e);
      // Fallback: save original if canvas export fails
      onSave(imageUrl);
      onClose();
    }
  };

  const handleDownload = async () => {
    try {
      const resultDataUrl = await renderProcessedCanvas();
      const a = document.createElement('a');
      a.href = resultDataUrl;
      a.download = `edited-composer-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Failed to download image', e);
    }
  };

  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'CYBERPUNK':
        setFilters({ ...DEFAULT_FILTERS, contrast: 130, saturation: 160, warmth: 25, hueRotate: 310 });
        break;
      case 'NOIR':
        setFilters({ ...DEFAULT_FILTERS, grayscale: 100, contrast: 145, brightness: 90 });
        break;
      case 'VIVID':
        setFilters({ ...DEFAULT_FILTERS, contrast: 120, saturation: 140, brightness: 105 });
        break;
      case 'WARM_GOLD':
        setFilters({ ...DEFAULT_FILTERS, sepia: 25, warmth: 35, saturation: 115, brightness: 105 });
        break;
      case 'COOL_STEEL':
        setFilters({ ...DEFAULT_FILTERS, warmth: -40, saturation: 85, contrast: 115 });
        break;
      case 'DEFAULT':
      default:
        setFilters(DEFAULT_FILTERS);
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-6 animate-fade-in">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[850px] bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#FF853E]/10 text-[#FF853E]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">{title}</h2>
              <p className="text-xs text-zinc-400">Post-processing, grading and precise framing</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              title="Download to PC"
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setRotation(0);
                setFlipH(false);
                setFlipV(false);
                setCropBox({ x: 0, y: 0, width: 100, height: 100 });
              }}
              title="Reset All Adjustments"
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Central Workspace: Canvas Viewport & Sidebar Controls */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Main Visual Preview Area */}
          <div className="flex-1 bg-zinc-950/80 flex items-center justify-center p-4 relative select-none overflow-hidden">
            <div 
              ref={containerRef}
              className="relative max-w-full max-h-full flex items-center justify-center shadow-2xl border border-zinc-800/50 rounded-lg overflow-hidden bg-black/40"
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transition: 'transform 0.2s ease',
              }}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Source preview"
                className="max-h-[58vh] max-w-full object-contain pointer-events-none select-none"
                style={{
                  filter: cssFilter,
                }}
              />

              {/* Crop Box Overlay (Active only when in CROP tab or partially visible) */}
              {(cropBox.width < 100 || cropBox.height < 100 || activeTab === 'CROP') && (
                <div
                  onMouseDown={handleMouseDownCrop}
                  className={`absolute border-2 border-[#FF853E] cursor-move transition-shadow ${
                    isDraggingCrop ? 'shadow-[0_0_20px_rgba(255,133,62,0.6)]' : 'shadow-lg'
                  }`}
                  style={{
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                  }}
                >
                  {/* Rule of thirds grid lines */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-b border-white/20"></div>
                    <div className="border-r border-white/20"></div>
                    <div className="border-r border-white/20"></div>
                    <div></div>
                  </div>

                  {/* Corner handles */}
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-[#FF853E] rounded-full border border-black pointer-events-none"></div>
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-[#FF853E] rounded-full border border-black pointer-events-none"></div>
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-[#FF853E] rounded-full border border-black pointer-events-none"></div>
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#FF853E] rounded-full border border-black pointer-events-none"></div>
                </div>
              )}
            </div>
          </div>

          {/* Right Control Panel */}
          <div className="w-full md:w-80 bg-zinc-900/90 border-t md:border-t-0 md:border-l border-zinc-800 flex flex-col justify-between overflow-y-auto">
            
            {/* Nav Tabs */}
            <div className="p-4 border-b border-zinc-800 flex space-x-1">
              <button
                onClick={() => setActiveTab('FILTERS')}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                  activeTab === 'FILTERS'
                    ? 'bg-[#FF853E] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Фильтры</span>
              </button>
              <button
                onClick={() => setActiveTab('CROP')}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                  activeTab === 'CROP'
                    ? 'bg-[#FF853E] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Кадрирование</span>
              </button>
              <button
                onClick={() => setActiveTab('TRANSFORM')}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                  activeTab === 'TRANSFORM'
                    ? 'bg-[#FF853E] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Поворот</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-5 flex-1 space-y-6 overflow-y-auto">
              
              {activeTab === 'FILTERS' && (
                <div className="space-y-5">
                  {/* Quick Preset Buttons */}
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                      Пресеты грейдинга
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'DEFAULT', label: 'Оригинал' },
                        { id: 'VIVID', label: 'Vivid' },
                        { id: 'WARM_GOLD', label: 'Золото' },
                        { id: 'CYBERPUNK', label: 'Неон' },
                        { id: 'NOIR', label: 'Нуар' },
                        { id: 'COOL_STEEL', label: 'Холод' },
                      ].map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => applyPreset(preset.id)}
                          className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700/50 hover:border-zinc-500"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Brightness Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" /> Яркость
                      </span>
                      <span className="font-mono text-zinc-400">{filters.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="160"
                      value={filters.brightness}
                      onChange={e => setFilters({ ...filters, brightness: Number(e.target.value) })}
                      className="w-full accent-[#FF853E] h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Contrast Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <Contrast className="w-3.5 h-3.5 text-blue-400" /> Контраст
                      </span>
                      <span className="font-mono text-zinc-400">{filters.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="180"
                      value={filters.contrast}
                      onChange={e => setFilters({ ...filters, contrast: Number(e.target.value) })}
                      className="w-full accent-[#FF853E] h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Saturation Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-emerald-400" /> Насыщенность
                      </span>
                      <span className="font-mono text-zinc-400">{filters.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={filters.saturation}
                      onChange={e => setFilters({ ...filters, saturation: Number(e.target.value) })}
                      className="w-full accent-[#FF853E] h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Warmth Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Теплота / Оттенок</span>
                      <span className="font-mono text-zinc-400">{filters.warmth > 0 ? `+${filters.warmth}` : filters.warmth}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={filters.warmth}
                      onChange={e => setFilters({ ...filters, warmth: Number(e.target.value) })}
                      className="w-full accent-[#FF853E] h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Grayscale Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Черно-белый (Grayscale)</span>
                      <span className="font-mono text-zinc-400">{filters.grayscale}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.grayscale}
                      onChange={e => setFilters({ ...filters, grayscale: Number(e.target.value) })}
                      className="w-full accent-[#FF853E] h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'CROP' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                      Пропорции кадра (Aspect Ratio)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'free', label: 'Свободный (Весь кадр)' },
                        { id: '1:1', label: '1:1 (Квадрат)' },
                        { id: '16:9', label: '16:9 (Широкий)' },
                        { id: '9:16', label: '9:16 (Stories/Reels)' },
                        { id: '4:3', label: '4:3 (Классик)' },
                        { id: '3:4', label: '3:4 (Портрет)' },
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => applyAspectPreset(p.id as AspectPreset)}
                          className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all text-left ${
                            aspectPreset === p.id
                              ? 'border-[#FF853E] bg-[#FF853E]/15 text-white'
                              : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                    💡 <strong>Подсказка:</strong> Зажмите и перетаскивайте оранжевую рамку на изображении слева, чтобы выбрать область кадрирования.
                  </p>
                </div>
              )}

              {activeTab === 'TRANSFORM' && (
                <div className="space-y-4">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                    Ориентация и отражение
                  </label>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      onClick={() => setRotation(r => (r + 90) % 360)}
                      className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-between border border-zinc-700/60"
                    >
                      <span className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-[#FF853E]" /> Повернуть на 90°
                      </span>
                      <span className="font-mono text-zinc-400">{rotation}°</span>
                    </button>

                    <button
                      onClick={() => setFlipH(f => !f)}
                      className={`px-4 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-between border transition-all ${
                        flipH
                          ? 'border-[#FF853E] bg-[#FF853E]/15 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FlipHorizontal className="w-4 h-4 text-[#FF853E]" /> Отразить по горизонтали
                      </span>
                      <span className="text-[10px] uppercase font-mono">{flipH ? 'Вкл' : 'Выкл'}</span>
                    </button>

                    <button
                      onClick={() => setFlipV(f => !f)}
                      className={`px-4 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-between border transition-all ${
                        flipV
                          ? 'border-[#FF853E] bg-[#FF853E]/15 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FlipVertical className="w-4 h-4 text-[#FF853E]" /> Отразить по вертикали
                      </span>
                      <span className="text-[10px] uppercase font-mono">{flipV ? 'Вкл' : 'Выкл'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Commit Bar */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex flex-col gap-2">
              <button
                onClick={handleSave}
                className="w-full py-3 px-4 rounded-xl bg-[#FF853E] hover:bg-[#ff7320] text-black font-black uppercase tracking-wider text-xs flex items-center justify-center space-x-2 shadow-lg transition-transform active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Сохранить в проект</span>
              </button>
              
              <button
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white font-medium text-xs transition-colors"
              >
                Пропустить / Оставить как есть
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default ImageEditorModal;
