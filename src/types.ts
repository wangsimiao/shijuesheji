export type ItemType = 'image' | 'video' | 'text' | 'drawing' | 'shape' | 'line' | 'loading';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; // text or base64 data URL
  prompt?: string;
  mimeType?: string;
  sourceKind?: 'uploaded' | 'generated';
  points?: CanvasPoint[];
  strokeColor?: string;
  strokeWidth?: number;
  shapeType?: 'rect';
  fillColor?: string;
  crop?: CanvasCrop;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  isImageLoading?: boolean;
  attachedImages?: string[];
}

export interface ChatInputImage {
  id: string;
  data: string;
  source: 'canvas' | 'local' | 'brand';
  name?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface BrandTemplate {
  id: string;
  name: string;
  image: string;
}

export interface BrandSpec {
  id: string;
  brandName: string;
  specText: string;
  updatedAt: number;
}

export type AiVisionSceneTab = 'general' | 'main_image' | 'detail_image' | 'buyer_show';

export type ProductMonitorCycle = 'daily' | 'weekly' | 'monthly';

export type ProductMonitorRunStatus = 'success' | 'warning' | 'failed';

export interface ProductMonitorConfig {
  categories: string[];
  customCategories: string[];
  cycle: ProductMonitorCycle;
  runTime: string; // HH:mm
  weekDay: number; // 1-7 (Monday-Sunday)
  monthDay: number; // 1-28
  updatedAt: number;
}

export interface ProductMonitorRun {
  id: string;
  executedAt: number;
  status: ProductMonitorRunStatus;
  categories: string[];
  cycle: ProductMonitorCycle;
  summary: string;
}

export type AppRoute =
  | 'home'
  | 'product'
  | 'operations'
  | 'design'
  | 'ai_visual'
  | 'openlovart'
  | 'profile'
  | 'admin';

export type ModelProviderId = 'doubao' | 'openrouter';

export interface ModelProviderSettings {
  imageModel: string;
  apiBaseUrl: string;
  apiKey: string;
}

export interface ModelSettings {
  providers: {
    doubao: ModelProviderSettings;
    openrouter: ModelProviderSettings;
  };
  defaultAiVisionImageModel: string;
  retryCount: number;
  timeoutMs: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  items: CanvasItem[];
  sessions: ChatSession[];
  currentSessionId?: string;
  view: ViewState;
  selectedImageModel?: string;
  sceneBySessionId?: Record<string, AiVisionSceneTab>;
  updatedAt: number;
  creatorId?: string;
  creatorName?: string;
}

export type OpenLovartElementType = 'image' | 'text' | 'shape' | 'path';

export type OpenLovartShapeType =
  | 'square'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'message'
  | 'arrow-left'
  | 'arrow-right';

export interface OpenLovartPoint {
  x: number;
  y: number;
}

export interface OpenLovartElement {
  id: string;
  type: OpenLovartElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
  content?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  shapeType?: OpenLovartShapeType;
  points?: OpenLovartPoint[];
  strokeWidth?: number;
}

export interface OpenLovartViewState {
  x: number;
  y: number;
  scale: number;
  selectedIds: string[];
}

export interface OpenLovartMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  attachedImages?: string[];
  createdAt: number;
}

export type OpenLovartChatModelOptionId = 'default' | 'backup' | 'custom';

export type OpenLovartImageScene =
  | 'general'
  | 'main_image'
  | 'detail_image'
  | 'buyer_show'
  | 'sku';

export interface OpenLovartChatSession {
  id: string;
  title: string;
  messages: OpenLovartMessage[];
  createdAt: number;
}

export interface OpenLovartProject {
  id: string;
  name: string;
  elements: OpenLovartElement[];
  view: OpenLovartViewState;
  sessions: OpenLovartChatSession[];
  currentSessionId: string;
  chatModelOptionId: OpenLovartChatModelOptionId;
  customChatModelId: string;
  imageScene: OpenLovartImageScene;
  messages?: OpenLovartMessage[]; // legacy compatibility field
  updatedAt: number;
  creatorId?: string;
  creatorName?: string;
}

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
  avatar?: string;
}

export interface ViewState {
  x: number;
  y: number;
  scale: number;
  selectedItemIds: string[];
  selectedItemId?: string | null; // For backwards compatibility
}
