import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_IMAGE_MODEL_OPTION,
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GEMINI_FLASH_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
  normalizeImageModel,
  parseLegacyWorkspaceSnapshot,
} from './components/ai-vision/workspace-model';
import {
  BrandSpec,
  BrandTemplate,
  ModelProviderSettings,
  ModelSettings,
  OpenLovartProject,
  ProductMonitorConfig,
  ProductMonitorRun,
  Project,
  User,
  ViewState,
} from './types';

const PROJECTS_KEY = 'ecommerce_ai_projects';
const PROJECTS_DB_NAME = 'ecommerce_ai_projects_db';
const PROJECTS_STORE_NAME = 'projects';
const PROJECTS_LS_MIGRATION_KEY = 'ecommerce_ai_projects_idb_migrated_v1';
const BRAND_TEMPLATES_KEY = 'ecommerce_ai_brand_templates';
const BRAND_SPECS_KEY = 'ecommerce_ai_brand_specs';
const MODEL_SETTINGS_KEY = 'ecommerce_ai_model_settings';
const OPEN_LOVART_PROJECTS_KEY = 'ecommerce_ai_openlovart_projects';
const PRODUCT_MONITOR_CONFIG_KEY = 'ecommerce_ai_product_monitor_config';
const PRODUCT_MONITOR_RUNS_KEY = 'ecommerce_ai_product_monitor_runs';
const LEGACY_AI_VISION_STORAGE_KEY = 'ai_visual_workspace_v1';
const LEGACY_AI_VISION_MIGRATION_KEY = 'ecommerce_ai_ai_visual_migrated_v1';
const DOUBAO_DEFAULT_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const OPENROUTER_DEFAULT_API_BASE_URL = 'https://singapore.zw-ai.com/api/v1/chat/completions';

const DEFAULT_VIEW: ViewState = {
  x: 100,
  y: 100,
  scale: 1,
  selectedItemIds: [],
};

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  providers: {
    doubao: {
      imageModel: DOUBAO_5_IMAGE_MODEL,
      apiBaseUrl: DOUBAO_DEFAULT_API_BASE_URL,
      apiKey: '',
    },
    openrouter: {
      imageModel: OPENROUTER_GPT_IMAGE_MODEL,
      apiBaseUrl: OPENROUTER_DEFAULT_API_BASE_URL,
      apiKey: '',
    },
  },
  defaultAiVisionImageModel: OPENROUTER_GEMINI_FLASH_IMAGE_MODEL,
  retryCount: 1,
  timeoutMs: 45000,
  updatedAt: Date.now(),
};

type LegacyModelSettings = Partial<{
  provider: 'doubao';
  displayName: string;
  imageModel: string;
  apiBaseUrl: string;
  apiKey: string;
  promptPrefix: string;
  promptSuffix: string;
  retryCount: number;
  timeoutMs: number;
  updatedAt: number;
}>;

const DEFAULT_MONITOR_CONFIG_BASE: Omit<ProductMonitorConfig, 'updatedAt'> = {
  categories: ['餐饮'],
  customCategories: [],
  cycle: 'daily',
  runTime: '09:00',
  weekDay: 1,
  monthDay: 1,
};

const ZICHEN_DEFAULT_SPEC = `【梓晨品牌AI生图·固定版式】
尺寸：1200px宽度
风格：柔软治愈、纯净安心、母婴级、软美学、明亮居家
主色：#FFDC39柠檬黄，白/浅灰/黑
字体：梦源黑体CN，圆润干净
辅助图形：Z形拥抱曲线
圆角规范：大模块右上左下80px，小模块四角40px
间距规范：模块间距80px，内边距20px/75px，图文间距100px

【主图版式】
1. LOGO：左上角60px，ZTION梓晨横版
2. 标题：顶部偏左距顶270px，660×200px
3. 产品：画面正中960×680px
4. 卖点：产品下方320×520px
5. 打标：顶部通栏1080×180px
布局严谨、居中对齐、无杂乱、品牌统一

【详情页ABC版式】
A类(20–50%)：首屏温馨家居场景大图
B类(30%)：分栏卖点卡片，圆角模块
C类(20–50%)：产品细节参数网格展示
顺序：A→B→C，节奏清晰，不重复超过3次`;

let projectsDbPromise: Promise<IDBDatabase> | null = null;
let projectStorageReadyPromise: Promise<void> | null = null;

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function hasIndexedDb() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getProjectsFromLocalStorage(): Project[] {
  const projects = safeJsonParse<Project[]>(localStorage.getItem(PROJECTS_KEY), []);
  return Array.isArray(projects)
    ? [...projects].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    : [];
}

function saveProjectsToLocalStorage(projects: Project[]) {
  persist(PROJECTS_KEY, projects);
}

function openProjectsDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  if (projectsDbPromise) {
    return projectsDbPromise;
  }

  projectsDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PROJECTS_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
        db.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Open IndexedDB failed'));
  });

  return projectsDbPromise;
}

async function getAllProjectsFromIndexedDb(): Promise<Project[]> {
  const db = await openProjectsDatabase();
  return new Promise<Project[]>((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as Project[]) || []);
    request.onerror = () => reject(request.error || new Error('Read IndexedDB projects failed'));
  });
}

async function getProjectFromIndexedDb(id: string): Promise<Project | null> {
  const db = await openProjectsDatabase();
  return new Promise<Project | null>((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as Project | undefined) || null);
    request.onerror = () => reject(request.error || new Error('Read IndexedDB project failed'));
  });
}

async function putProjectIntoIndexedDb(project: Project): Promise<void> {
  const db = await openProjectsDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE_NAME);
    const request = store.put(project);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Write IndexedDB project failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Write IndexedDB project aborted'));
  });
}

async function deleteProjectFromIndexedDb(projectId: string): Promise<void> {
  const db = await openProjectsDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE_NAME);
    const request = store.delete(projectId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Delete IndexedDB project failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Delete IndexedDB project aborted'));
  });
}

async function ensureProjectStorageReady(): Promise<void> {
  if (!hasIndexedDb()) return;
  if (!projectStorageReadyPromise) {
    projectStorageReadyPromise = (async () => {
      if (localStorage.getItem(PROJECTS_LS_MIGRATION_KEY) === '1') return;

      const legacyProjects = getProjectsFromLocalStorage();
      if (legacyProjects.length > 0) {
        const existingProjects = await getAllProjectsFromIndexedDb();
        const merged = new Map<string, Project>();

        for (const project of existingProjects) {
          merged.set(project.id, project);
        }

        for (const project of legacyProjects) {
          const existing = merged.get(project.id);
          if (!existing || Number(project.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
            merged.set(project.id, project);
          }
        }

        for (const project of merged.values()) {
          await putProjectIntoIndexedDb(project);
        }
      }

      localStorage.removeItem(PROJECTS_KEY);
      localStorage.setItem(PROJECTS_LS_MIGRATION_KEY, '1');
    })();
  }

  await projectStorageReadyPromise;
}

function sortProjects(projects: Project[]) {
  return [...projects].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function normalizeProviderSettings(
  candidate: Partial<ModelProviderSettings> | null | undefined,
  fallback: ModelProviderSettings
): ModelProviderSettings {
  return {
    imageModel:
      typeof candidate?.imageModel === 'string' && candidate.imageModel.trim()
        ? candidate.imageModel.trim()
        : fallback.imageModel,
    apiBaseUrl:
      typeof candidate?.apiBaseUrl === 'string' && candidate.apiBaseUrl.trim()
        ? candidate.apiBaseUrl.trim()
        : fallback.apiBaseUrl,
    apiKey:
      typeof candidate?.apiKey === 'string' && candidate.apiKey.trim() ? candidate.apiKey.trim() : '',
  };
}

export async function getProjects(): Promise<Project[]> {
  if (!hasIndexedDb()) {
    return getProjectsFromLocalStorage();
  }

  await ensureProjectStorageReady();
  return sortProjects(await getAllProjectsFromIndexedDb());
}

export async function getProject(id: string): Promise<Project | null> {
  if (!hasIndexedDb()) {
    return getProjectsFromLocalStorage().find((project) => project.id === id) || null;
  }

  await ensureProjectStorageReady();
  return getProjectFromIndexedDb(id);
}

export async function getMostRecentProject(): Promise<Project | null> {
  const projects = await getProjects();
  return projects[0] || null;
}

export async function saveProjects(projects: Project[]) {
  if (!hasIndexedDb()) {
    saveProjectsToLocalStorage(projects);
    return;
  }

  await ensureProjectStorageReady();
  for (const project of projects) {
    await putProjectIntoIndexedDb({ ...project, updatedAt: Date.now() });
  }
}

export async function saveProject(project: Project) {
  const normalizedProject = { ...project, updatedAt: Date.now() };

  if (!hasIndexedDb()) {
    const projects = getProjectsFromLocalStorage().filter((item) => item.id !== normalizedProject.id);
    projects.unshift(normalizedProject);
    saveProjectsToLocalStorage(projects);
    return;
  }

  await ensureProjectStorageReady();
  await putProjectIntoIndexedDb(normalizedProject);
}

export async function createNewProject(name: string): Promise<Project> {
  const currentUser = getCurrentUser();
  const sessionId = uuidv4();
  const modelSettings = getModelSettings();
  const project: Project = {
    id: uuidv4(),
    name: name.trim() || 'AI 设计项目',
    items: [],
    sessions: [{ id: sessionId, title: 'New chat', messages: [], createdAt: Date.now() }],
    currentSessionId: sessionId,
    view: { ...DEFAULT_VIEW },
    selectedImageModel:
      modelSettings.defaultAiVisionImageModel || DEFAULT_IMAGE_MODEL_OPTION.value,
    sceneBySessionId: { [sessionId]: 'general' },
    updatedAt: Date.now(),
    creatorId: currentUser.id,
    creatorName: currentUser.name,
  };
  await saveProject(project);
  return project;
}

export async function deleteProject(projectId: string) {
  if (!hasIndexedDb()) {
    saveProjectsToLocalStorage(getProjectsFromLocalStorage().filter((project) => project.id !== projectId));
    return;
  }

  await ensureProjectStorageReady();
  await deleteProjectFromIndexedDb(projectId);
}

export async function migrateLegacyAiVisualSnapshotToProject(): Promise<Project | null> {
  if (typeof window === 'undefined') return null;
  if (window.localStorage.getItem(LEGACY_AI_VISION_MIGRATION_KEY) === '1') {
    return null;
  }

  const snapshot = parseLegacyWorkspaceSnapshot(
    window.localStorage.getItem(LEGACY_AI_VISION_STORAGE_KEY)
  );

  if (!snapshot) {
    return null;
  }

  const currentUser = getCurrentUser();
  const project: Project = {
    id: uuidv4(),
    name: snapshot.boardName.trim() || 'AI 视觉项目',
    items: snapshot.items,
    sessions: snapshot.sessions,
    currentSessionId: snapshot.currentSessionId,
    view: snapshot.view,
    selectedImageModel: snapshot.selectedImageModel,
    sceneBySessionId: snapshot.sceneBySessionId,
    updatedAt: Date.now(),
    creatorId: currentUser.id,
    creatorName: currentUser.name,
  };

  await saveProject(project);
  window.localStorage.setItem(LEGACY_AI_VISION_MIGRATION_KEY, '1');
  return project;
}

export async function getBrandTemplatesHydrated(): Promise<BrandTemplate[]> {
  const list = safeJsonParse<BrandTemplate[]>(localStorage.getItem(BRAND_TEMPLATES_KEY), []);
  return Array.isArray(list) ? list : [];
}

export async function addBrandTemplateHydrated(
  name: string,
  imageData: string
): Promise<BrandTemplate> {
  const template: BrandTemplate = {
    id: uuidv4(),
    name: name.trim() || '未命名模板',
    image: imageData,
  };
  const templates = await getBrandTemplatesHydrated();
  templates.unshift(template);
  persist(BRAND_TEMPLATES_KEY, templates);
  return template;
}

function createDefaultBrandSpecs(): BrandSpec[] {
  return [
    {
      id: 'brand-zichen',
      brandName: '梓晨',
      specText: ZICHEN_DEFAULT_SPEC,
      updatedAt: Date.now(),
    },
  ];
}

function normalizeBrandSpecs(input: unknown): BrandSpec[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Partial<BrandSpec>;
      const brandName = typeof candidate.brandName === 'string' ? candidate.brandName.trim() : '';
      const specText = typeof candidate.specText === 'string' ? candidate.specText : '';
      if (!brandName) return null;
      if (brandName.toLowerCase() === 'aa') return null;
      return {
        id:
          typeof candidate.id === 'string' && candidate.id.trim()
            ? candidate.id.trim()
            : uuidv4(),
        brandName,
        specText,
        updatedAt:
          typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : Date.now(),
      } satisfies BrandSpec;
    })
    .filter((item): item is BrandSpec => Boolean(item));
}

export function getBrandSpecs(): BrandSpec[] {
  const parsed = safeJsonParse<BrandSpec[] | null>(localStorage.getItem(BRAND_SPECS_KEY), null);
  const normalized = normalizeBrandSpecs(parsed);
  if (normalized.length > 0) return normalized;
  const defaults = createDefaultBrandSpecs();
  persist(BRAND_SPECS_KEY, defaults);
  return defaults;
}

export function saveBrandSpecs(specs: BrandSpec[]) {
  const normalized = normalizeBrandSpecs(specs);
  persist(BRAND_SPECS_KEY, normalized.length > 0 ? normalized : createDefaultBrandSpecs());
}

export function deleteBrandSpec(brandSpecId: string): BrandSpec[] {
  const list = getBrandSpecs().filter((item) => item.id !== brandSpecId);
  const nextList = list.length > 0 ? list : createDefaultBrandSpecs();
  saveBrandSpecs(nextList);
  return nextList;
}

export function upsertBrandSpec(brandName: string, specText: string): BrandSpec {
  const trimmedName = brandName.trim();
  if (!trimmedName) {
    throw new Error('品牌名称不能为空');
  }
  const trimmedSpecText = specText.trim();
  const list = getBrandSpecs();
  const existingIndex = list.findIndex(
    (item) => item.brandName.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  const nextItem: BrandSpec = {
    id: existingIndex >= 0 ? list[existingIndex].id : uuidv4(),
    brandName: trimmedName,
    specText: trimmedSpecText,
    updatedAt: Date.now(),
  };
  if (existingIndex >= 0) {
    list[existingIndex] = nextItem;
  } else {
    list.unshift(nextItem);
  }
  saveBrandSpecs(list);
  return nextItem;
}

export function createDefaultModelSettings(): ModelSettings {
  return {
    providers: {
      doubao: { ...DEFAULT_MODEL_SETTINGS.providers.doubao },
      openrouter: { ...DEFAULT_MODEL_SETTINGS.providers.openrouter },
    },
    defaultAiVisionImageModel: DEFAULT_MODEL_SETTINGS.defaultAiVisionImageModel,
    retryCount: DEFAULT_MODEL_SETTINGS.retryCount,
    timeoutMs: DEFAULT_MODEL_SETTINGS.timeoutMs,
    updatedAt: Date.now(),
  };
}

export function getModelSettings(): ModelSettings {
  const parsed = safeJsonParse<ModelSettings | LegacyModelSettings | null>(
    localStorage.getItem(MODEL_SETTINGS_KEY),
    null
  );
  if (!parsed) return createDefaultModelSettings();

  if ('providers' in parsed && parsed.providers) {
    const normalizedOpenRouterProvider = normalizeProviderSettings(
      parsed.providers.openrouter,
      DEFAULT_MODEL_SETTINGS.providers.openrouter
    );
    return {
      providers: {
        doubao: normalizeProviderSettings(parsed.providers.doubao, DEFAULT_MODEL_SETTINGS.providers.doubao),
        openrouter: {
          ...normalizedOpenRouterProvider,
          imageModel: normalizeImageModel(normalizedOpenRouterProvider.imageModel),
        },
      },
      defaultAiVisionImageModel: normalizeImageModel(
        typeof parsed.defaultAiVisionImageModel === 'string'
          ? parsed.defaultAiVisionImageModel
          : DEFAULT_MODEL_SETTINGS.defaultAiVisionImageModel
      ),
      retryCount:
        typeof parsed.retryCount === 'number' && Number.isFinite(parsed.retryCount)
          ? parsed.retryCount
          : DEFAULT_MODEL_SETTINGS.retryCount,
      timeoutMs:
        typeof parsed.timeoutMs === 'number' && Number.isFinite(parsed.timeoutMs)
          ? parsed.timeoutMs
          : DEFAULT_MODEL_SETTINGS.timeoutMs,
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : Date.now(),
    };
  }

  const legacy = parsed as LegacyModelSettings;
  return {
    providers: {
      doubao: normalizeProviderSettings(
        {
          imageModel: legacy.imageModel,
          apiBaseUrl: legacy.apiBaseUrl,
          apiKey: legacy.apiKey,
        },
        DEFAULT_MODEL_SETTINGS.providers.doubao
      ),
      openrouter: { ...DEFAULT_MODEL_SETTINGS.providers.openrouter },
    },
    defaultAiVisionImageModel: DEFAULT_MODEL_SETTINGS.defaultAiVisionImageModel,
    retryCount:
      typeof legacy.retryCount === 'number' && Number.isFinite(legacy.retryCount)
        ? legacy.retryCount
        : DEFAULT_MODEL_SETTINGS.retryCount,
    timeoutMs:
      typeof legacy.timeoutMs === 'number' && Number.isFinite(legacy.timeoutMs)
        ? legacy.timeoutMs
        : DEFAULT_MODEL_SETTINGS.timeoutMs,
    updatedAt:
      typeof legacy.updatedAt === 'number' && Number.isFinite(legacy.updatedAt)
        ? legacy.updatedAt
        : Date.now(),
  };
}

export function saveModelSettings(settings: ModelSettings) {
  persist(MODEL_SETTINGS_KEY, { ...settings, updatedAt: Date.now() });
}

export function getOpenLovartProjects(): OpenLovartProject[] {
  const parsed = safeJsonParse<OpenLovartProject[]>(localStorage.getItem(OPEN_LOVART_PROJECTS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveOpenLovartProjects(projects: OpenLovartProject[]) {
  persist(OPEN_LOVART_PROJECTS_KEY, projects);
}

export function getOpenLovartProject(id: string): OpenLovartProject | null {
  return getOpenLovartProjects().find((project) => project.id === id) || null;
}

export function saveOpenLovartProject(project: OpenLovartProject) {
  const projects = getOpenLovartProjects().filter((item) => item.id !== project.id);
  projects.unshift({ ...project, updatedAt: Date.now() });
  saveOpenLovartProjects(projects);
}

export function createOpenLovartProject(name: string): OpenLovartProject {
  const user = getCurrentUser();
  const sessionId = uuidv4();
  const project: OpenLovartProject = {
    id: uuidv4(),
    name: name.trim() || 'OpenLovart Project',
    elements: [],
    view: { x: 120, y: 100, scale: 1, selectedIds: [] },
    sessions: [{ id: sessionId, title: 'New chat', messages: [], createdAt: Date.now() }],
    currentSessionId: sessionId,
    chatModelOptionId: 'default',
    customChatModelId: '',
    imageScene: 'general',
    updatedAt: Date.now(),
    creatorId: user.id,
    creatorName: user.name,
  };
  saveOpenLovartProject(project);
  return project;
}

export function deleteOpenLovartProject(projectId: string) {
  saveOpenLovartProjects(getOpenLovartProjects().filter((project) => project.id !== projectId));
}

export function getProductMonitorConfig(): ProductMonitorConfig {
  const parsed = safeJsonParse<ProductMonitorConfig | null>(
    localStorage.getItem(PRODUCT_MONITOR_CONFIG_KEY),
    null
  );
  if (!parsed) {
    return { ...DEFAULT_MONITOR_CONFIG_BASE, updatedAt: Date.now() };
  }
  return {
    ...DEFAULT_MONITOR_CONFIG_BASE,
    ...parsed,
    updatedAt: Number(parsed.updatedAt || Date.now()),
  };
}

export function saveProductMonitorConfig(config: ProductMonitorConfig) {
  persist(PRODUCT_MONITOR_CONFIG_KEY, { ...config, updatedAt: Date.now() });
}

export function getProductMonitorRuns(): ProductMonitorRun[] {
  const parsed = safeJsonParse<ProductMonitorRun[]>(localStorage.getItem(PRODUCT_MONITOR_RUNS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveProductMonitorRuns(runs: ProductMonitorRun[]) {
  persist(PRODUCT_MONITOR_RUNS_KEY, runs);
}

export function appendProductMonitorRun(run: ProductMonitorRun) {
  const nextRuns = [run, ...getProductMonitorRuns()].slice(0, 20);
  saveProductMonitorRuns(nextRuns);
}

const USERS: User[] = [
  { id: 'user-001', name: 'Admin A', role: 'admin', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=AdminA' },
  { id: 'user-002', name: 'Admin B', role: 'admin', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=AdminB' },
  { id: 'user-003', name: 'Admin C', role: 'admin', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=AdminC' },
];

export function getAllUsers(): User[] {
  return USERS;
}

export function getCurrentUser(): User {
  return USERS[0];
}
