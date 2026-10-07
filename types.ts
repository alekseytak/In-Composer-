
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type AppMode = 'MANUAL' | 'AGENT' | 'CONSILIUM' | 'SYMPOSIUM' | 'BUSINESS' | 'LIVE' | 'FLOW';
export type AppTheme = 'LIGHT' | 'DARK' | 'GOLDEN';
export type Resolution = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
export type ExportFormat = 'png' | 'jpg' | 'webp';
export type Language = 'en' | 'ru';

export interface Folder {
  id: string;
  name: string;
  timestamp: number;
}

export interface Project {
  id: string;
  name: string;
  timestamp: number;
  folderId?: string;
}

export interface Asset {
  id: string;
  type: 'image' | 'text' | 'blueprint';
  content: string; // Base64 or Text
  name: string;
  timestamp: number;
  analysis?: string; // AI Vision analysis result
  metadata?: Record<string, any>;
}

export interface GenerationResult {
  id: string;
  url: string;
  prompt: string;
  negativePrompt?: string;
  timestamp: number;
  mode: AppMode;
  projectId?: string;
  folderId?: string;
  metadata?: {
    searchSources?: { web: { uri: string; title: string } }[];
    groundingMetadata?: any;
  };
}

export interface AgentStep {
  type: 'THOUGHT' | 'ACTION' | 'RESULT' | 'SEARCH';
  content: string;
  timestamp: number;
}

export interface SymposiumDebate {
  role: string;
  message: string;
}

export interface ConsiliumExpert {
  expert: string;
  critique: string;
  improvedPrompt: string;
}

export type ProviderType = 'gemini' | 'openrouter' | 'groq' | 'openai' | 'anthropic' | 'custom_openai';

export interface AIProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
  imageModel?: string;
  enabled: boolean;
  isDefault?: boolean;
}

export interface ImageFilterSettings {
  brightness: number; // 0 to 200 (100 is default)
  contrast: number;   // 0 to 200 (100 is default)
  saturation: number; // 0 to 200 (100 is default)
  grayscale: number;  // 0 to 100 (0 is default)
  sepia: number;      // 0 to 100 (0 is default)
  warmth: number;     // -50 to 50 (0 is default)
  hueRotate: number;  // 0 to 360 (0 is default)
  blur: number;       // 0 to 20 (0 is default)
  invert: number;     // 0 or 100 (0 is default)
}

export interface CropArea {
  x: number;      // 0 to 100%
  y: number;      // 0 to 100%
  width: number;  // 0 to 100%
  height: number; // 0 to 100%
}

