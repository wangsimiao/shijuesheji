import { v4 as uuidv4 } from 'uuid';
import {
  BrandTemplate,
  ModelSettings,
  OpenLovartProject,
  OpenPencilProject,
  ProductMonitorConfig,
  ProductMonitorRun,
  Project,
  User,
  ViewState,
} from './types';

const PROJECTS_KEY = 'ecommerce_ai_projects';
const BRAND_TEMPLATES_KEY = 'ecommerce_ai_brand_templates';
const MODEL_SETTINGS_KEY = 'ecommerce_ai_model_settings';
const OPEN_PENCIL_PROJECTS_KEY = 'ecommerce_ai_openpencil_projects';
const OPEN_LOVART_PROJECTS_KEY = 'ecommerce_ai_openlovart_projects';
const PRODUCT_MONITOR_CONFIG_KEY = 'ecommerce_ai_product_monitor_config';
const PRODUCT_MONITOR_RUNS_KEY = 'ecommerce_ai_product_monitor_runs';

const DEFAULT_VIEW: ViewState = {
  x: 100,
  y: 100,
  scale: 1,
  selectedItemIds: [],
};

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: 'doubao',
  displayName: '豆包',
  imageModel: 'doubao-seedream-5-0-260128',
  apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: '',
  promptPrefix: '',
  promptSuffix: '',
  retryCount: 1,
  timeoutMs: 45000,
  updatedAt: Date.now(),
};

const DEFAULT_MONITOR_CONFIG_BASE: Omit<ProductMonitorConfig, 'updatedAt'> = {
  categories: ['餐桌'],
  customCategories: [],
  cycle: 'daily',
  runTime: '09:00',
  weekDay: 1,
  monthDay: 1,
};

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

function createEmptyOpenPencilDocument() {
  return {
    id: 'doc_root',
    type: 'document',
    name: 'Document',
    children: [
      {
        id: 'page_1',
        type: 'page',
        name: 'Page 1',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        children: [],
      },
    ],
  } as any;
}

export function getProjects(): Project[] {
  const projects = safeJsonParse<Project[]>(localStorage.getItem(PROJECTS_KEY), []);
  return Array.isArray(projects) ? projects : [];
}

export function getProject(id: string): Project | null {
  return getProjects().find((project) => project.id === id) || null;
}

export function saveProjects(projects: Project[]) {
  persist(PROJECTS_KEY, projects);
}

export function saveProject(project: Project) {
  const projects = getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    projects[index] = { ...project, updatedAt: Date.now() };
  } else {
    projects.unshift({ ...project, updatedAt: Date.now() });
  }
  saveProjects(projects);
}

export function createNewProject(name: string): Project {
  const currentUser = getCurrentUser();
  const project: Project = {
    id: uuidv4(),
    name: name.trim() || '未命名项目',
    items: [],
    sessions: [{ id: uuidv4(), title: 'New chat', messages: [], createdAt: Date.now() }],
    view: { ...DEFAULT_VIEW },
    updatedAt: Date.now(),
    creatorId: currentUser.id,
    creatorName: currentUser.name,
  };
  saveProject(project);
  return project;
}

export function deleteProject(projectId: string) {
  saveProjects(getProjects().filter((project) => project.id !== projectId));
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
  return { ...DEFAULT_MODEL_SETTINGS, updatedAt: Date.now() };
}

export function getModelSettings(): ModelSettings {
  const parsed = safeJsonParse<ModelSettings | null>(localStorage.getItem(MODEL_SETTINGS_KEY), null);
  if (!parsed) return createDefaultModelSettings();
  return {
    ...DEFAULT_MODEL_SETTINGS,
    ...parsed,
    provider: 'doubao',
  };
}

export function saveModelSettings(settings: ModelSettings) {
  persist(MODEL_SETTINGS_KEY, { ...settings, updatedAt: Date.now() });
}

export function getOpenPencilProjects(): OpenPencilProject[] {
  const parsed = safeJsonParse<OpenPencilProject[]>(localStorage.getItem(OPEN_PENCIL_PROJECTS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveOpenPencilProjects(projects: OpenPencilProject[]) {
  persist(OPEN_PENCIL_PROJECTS_KEY, projects);
}

export function getOpenPencilProject(id: string): OpenPencilProject | null {
  return getOpenPencilProjects().find((project) => project.id === id) || null;
}

export function saveOpenPencilProject(project: OpenPencilProject) {
  const projects = getOpenPencilProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    projects[index] = { ...project, updatedAt: Date.now() };
  } else {
    projects.unshift({ ...project, updatedAt: Date.now() });
  }
  saveOpenPencilProjects(projects);
}

export function createOpenPencilProject(name: string): OpenPencilProject {
  const user = getCurrentUser();
  const project: OpenPencilProject = {
    id: uuidv4(),
    name: name.trim() || 'OpenPencil Project',
    document: createEmptyOpenPencilDocument(),
    sessions: [{ id: uuidv4(), title: 'New chat', messages: [], createdAt: Date.now() }],
    updatedAt: Date.now(),
    creatorId: user.id,
    creatorName: user.name,
  };
  saveOpenPencilProject(project);
  return project;
}

export function deleteOpenPencilProject(projectId: string) {
  saveOpenPencilProjects(getOpenPencilProjects().filter((project) => project.id !== projectId));
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
  const projects = getOpenLovartProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    projects[index] = { ...project, updatedAt: Date.now() };
  } else {
    projects.unshift({ ...project, updatedAt: Date.now() });
  }
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
