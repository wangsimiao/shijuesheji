import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_IMAGE_MODEL_OPTION,
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
  parseLegacyWorkspaceSnapshot,
} from './components/ai-vision/workspace-model';
import {
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
const MODEL_SETTINGS_KEY = 'ecommerce_ai_model_settings';
const OPEN_LOVART_PROJECTS_KEY = 'ecommerce_ai_openlovart_projects';
const PRODUCT_MONITOR_CONFIG_KEY = 'ecommerce_ai_product_monitor_config';
const PRODUCT_MONITOR_RUNS_KEY = 'ecommerce_ai_product_monitor_runs';
const LEGACY_AI_VISION_STORAGE_KEY = 'ai_visual_workspace_v1';
const LEGACY_AI_VISION_MIGRATION_KEY = 'ecommerce_ai_ai_visual_migrated_v1';
const DOUBAO_DEFAULT_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const OPENROUTER_DEFAULT_API_BASE_URL = 'https://openrouter.ai/api/v1';

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
  defaultAiVisionImageModel: DEFAULT_IMAGE_MODEL_OPTION.value,
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
    return {
      providers: {
        doubao: normalizeProviderSettings(parsed.providers.doubao, DEFAULT_MODEL_SETTINGS.providers.doubao),
        openrouter: normalizeProviderSettings(
          parsed.providers.openrouter,
          DEFAULT_MODEL_SETTINGS.providers.openrouter
        ),
      },
      defaultAiVisionImageModel:
        typeof parsed.defaultAiVisionImageModel === 'string' && parsed.defaultAiVisionImageModel.trim()
          ? parsed.defaultAiVisionImageModel.trim()
          : DEFAULT_MODEL_SETTINGS.defaultAiVisionImageModel,
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
  { id: 'user-001', name: 'Admin', role: 'admin', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=Admin' },
  { id: 'user-002', name: 'Operator A', role: 'user', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=A' },
  { id: 'user-003', name: 'Operator B', role: 'user', avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=B' },
];

export function getAllUsers(): User[] {
  return USERS;
}

export function getCurrentUser(): User {
  return USERS[0];
}
