import React, { useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Save,
  Settings2,
  Trash2,
  Video,
} from 'lucide-react';
import HomeChatWorkspace from './HomeChatWorkspace';
import { AppRoute, ModelSettings, Project } from '../types';
import {
  createDefaultModelSettings,
  createNewProject,
  deleteProject,
  getModelSettings,
  getProjects,
  saveModelSettings,
} from '../store';
import {
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
} from './ai-vision/workspace-model';

interface DashboardProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenProject: (project: Project) => void;
}

const MENU_ITEMS: Array<{ route: AppRoute; label: string }> = [
  { route: 'home', label: '首页' },
  { route: 'product', label: 'AI 产品' },
  { route: 'operations', label: 'AI 运营' },
  { route: 'design', label: 'AI 设计' },
  { route: 'admin', label: '模型设置' },
];

const AI_VISION_IMAGE_MODEL_OPTIONS = [
  { value: OPENROUTER_GPT_IMAGE_MODEL, label: 'GPT 5.4 Image 2' },
  { value: DOUBAO_5_IMAGE_MODEL, label: '豆包 5.0' },
];

type ProjectPreviewMedia =
  | { type: 'image'; src: string }
  | { type: 'video'; src: string };

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

function formatProjectTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getProjectPreviewMedia(project: Project): ProjectPreviewMedia[] {
  const fromCanvas = project.items
    .filter((item) => item.type === 'image' || item.type === 'video')
    .map<ProjectPreviewMedia>((item) =>
      item.type === 'video'
        ? { type: 'video', src: item.content }
        : { type: 'image', src: item.content }
    );

  if (fromCanvas.length > 0) {
    return fromCanvas.slice(0, 4);
  }

  const seen = new Set<string>();
  const fromChat: ProjectPreviewMedia[] = [];
  const orderedSessions = [...project.sessions].sort(
    (left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0)
  );

  for (const session of orderedSessions) {
    for (const message of [...session.messages].reverse()) {
      if (message.imageUrl && !seen.has(message.imageUrl)) {
        seen.add(message.imageUrl);
        fromChat.push({ type: 'image', src: message.imageUrl });
      }

      for (const attachedImage of message.attachedImages || []) {
        if (seen.has(attachedImage)) continue;
        seen.add(attachedImage);
        fromChat.push({ type: 'image', src: attachedImage });
      }

      if (fromChat.length >= 4) {
        return fromChat.slice(0, 4);
      }
    }
  }

  return fromChat.slice(0, 4);
}

function ProjectPreview({ project }: { project: Project }) {
  const media = getProjectPreviewMedia(project);

  if (media.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-[#101116] text-slate-500">
        <ImageIcon className="h-10 w-10 opacity-70" />
      </div>
    );
  }

  if (media.length === 1) {
    const item = media[0];
    return item.type === 'image' ? (
      <img src={item.src} alt={project.name} className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-[#111319] text-slate-300">
        <Video className="h-10 w-10" />
      </div>
    );
  }

  const isThreeUp = media.length === 3;

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[2px] bg-white/[0.08]">
      {media.slice(0, 4).map((item, index) => (
        <div
          key={`${project.id}-preview-${index}`}
          className={`${isThreeUp && index === 0 ? 'row-span-2' : ''} overflow-hidden bg-[#101116]`}
        >
          {item.type === 'image' ? (
            <img
              src={item.src}
              alt={`${project.name} 预览 ${index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <Video className="h-8 w-8" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProviderSection({
  title,
  description,
  apiBaseUrl,
  apiKey,
  imageModel,
  modelOptions,
  onApiBaseUrlChange,
  onApiKeyChange,
  onImageModelChange,
}: {
  title: string;
  description: string;
  apiBaseUrl: string;
  apiKey: string;
  imageModel: string;
  modelOptions: Array<{ value: string; label: string }>;
  onApiBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onImageModelChange: (value: string) => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-[#151922] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">API Base URL</span>
          <input
            value={apiBaseUrl}
            onChange={(event) => onApiBaseUrlChange(event.target.value)}
            className="h-11 rounded-[14px] border border-white/[0.08] bg-[#0f131b] px-4 text-sm text-white outline-none transition focus:border-sky-400/60"
            placeholder="请输入接口地址"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            className="h-11 rounded-[14px] border border-white/[0.08] bg-[#0f131b] px-4 text-sm text-white outline-none transition focus:border-sky-400/60"
            placeholder="请输入 API Key"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">图片模型</span>
          <select
            value={imageModel}
            onChange={(event) => onImageModelChange(event.target.value)}
            className="h-11 rounded-[14px] border border-white/[0.08] bg-[#0f131b] px-4 text-sm text-white outline-none transition focus:border-sky-400/60"
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export default function Dashboard({ currentRoute, onNavigate, onOpenProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => createDefaultModelSettings());
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoute !== 'design') return;

    let cancelled = false;

    async function loadProjects() {
      setIsProjectsLoading(true);
      try {
        const nextProjects = await getProjects();
        if (!cancelled) {
          setProjects(nextProjects);
        }
      } finally {
        if (!cancelled) {
          setIsProjectsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [currentRoute, refreshToken]);

  useEffect(() => {
    if (currentRoute !== 'admin') return;
    setModelSettings(getModelSettings());
  }, [currentRoute]);

  useEffect(() => {
    if (!activeProjectMenuId) return;

    const handleWindowPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-project-menu="true"]')) {
        return;
      }
      setActiveProjectMenuId(null);
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [activeProjectMenuId]);

  useEffect(() => {
    if (!settingsNotice) return;
    const timer = window.setTimeout(() => setSettingsNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [settingsNotice]);

  const doubaoOptions = useMemo(
    () => AI_VISION_IMAGE_MODEL_OPTIONS.filter((option) => option.value === DOUBAO_5_IMAGE_MODEL),
    []
  );
  const openRouterOptions = useMemo(
    () =>
      AI_VISION_IMAGE_MODEL_OPTIONS.filter((option) => option.value === OPENROUTER_GPT_IMAGE_MODEL),
    []
  );

  const handleCreateProject = async () => {
    const project = await createNewProject('AI 设计项目');
    onOpenProject(project);
  };

  const handleSaveModelSettings = () => {
    saveModelSettings(modelSettings);
    setModelSettings(getModelSettings());
    setSettingsNotice('模型设置已保存');
  };

  const handleResetModelSettings = () => {
    setModelSettings(createDefaultModelSettings());
    setSettingsNotice('已恢复默认配置，请记得保存');
  };

  const renderDesignContent = () => (
    <div className="h-full overflow-y-auto bg-[#0d0f15] p-6 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px]">
      <div className="mx-auto max-w-[1600px]">
        {isProjectsLoading ? (
          <Placeholder title="正在加载项目" description="正在从本地项目库读取 AI 设计项目..." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                void handleCreateProject();
              }}
              className="group flex aspect-[1.03] flex-col rounded-[24px] border border-white/[0.06] bg-[#181a21] p-5 text-left shadow-[0_18px_44px_rgba(0,0,0,0.26)] transition hover:border-white/[0.12] hover:bg-[#1c1f27]"
            >
              <div className="flex flex-1 items-center justify-center rounded-[18px] bg-[#111216] text-slate-400 transition group-hover:text-slate-200">
                <div className="flex flex-col items-center gap-6">
                  <Plus className="h-14 w-14 stroke-[1.5]" />
                  <div className="text-[18px] font-semibold text-slate-200">新的画板</div>
                </div>
              </div>
            </button>

            {projects.map((project) => (
              <article
                key={project.id}
                className="group relative flex aspect-[1.03] flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#181a21] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.26)] transition hover:border-white/[0.12] hover:bg-[#1c1f27]"
              >
                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="flex min-h-0 flex-1 flex-col text-left"
                >
                  <div className="aspect-[1.48] overflow-hidden rounded-[18px] border border-white/[0.05] bg-[#101116]">
                    <ProjectPreview project={project} />
                  </div>

                  <div className="min-h-0 flex-1 px-1 pt-4">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-7 text-white">
                      {project.name || '未命名画板'}
                    </h3>
                  </div>
                </button>

                <div className="mt-3 flex items-center justify-between gap-3 px-1">
                  <div className="truncate text-[12px] tracking-[0.02em] text-slate-400">
                    {formatProjectTimestamp(project.updatedAt)}
                  </div>

                  <div data-project-menu="true" className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActiveProjectMenuId((current) => (current === project.id ? null : project.id));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                      aria-label="项目菜单"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {activeProjectMenuId === project.id ? (
                      <div className="absolute bottom-full right-0 z-20 mb-2 min-w-[138px] rounded-[16px] border border-white/[0.08] bg-[#161922] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.42)]">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveProjectMenuId(null);
                            onOpenProject(project);
                          }}
                          className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] text-slate-200 transition hover:bg-white/[0.06]"
                        >
                          <ImageIcon className="h-4 w-4" />
                          打开项目
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveProjectMenuId(null);
                            if (!window.confirm('确认删除这个项目吗？')) return;
                            void deleteProject(project.id).then(() => {
                              setRefreshToken((value) => value + 1);
                            });
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] text-rose-200 transition hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          删除项目
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAdminContent = () => (
    <div className="h-full overflow-y-auto bg-[#0d0f15] p-6">
      <div className="mx-auto max-w-[1120px] space-y-6">
        <section className="rounded-[28px] border border-white/[0.08] bg-[#141821] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
                <Settings2 className="h-3.5 w-3.5" />
                AI 设计模型设置
              </div>
              <h2 className="mt-4 text-[32px] font-semibold tracking-[0.01em] text-white">
                管理 AI 设计出图模型
              </h2>
              <p className="mt-3 max-w-[760px] text-sm leading-7 text-slate-400">
                这里统一配置 AI 设计里的出图模型连接信息。豆包与 OpenRouter 都只读取此页面保存的配置，不再回退本地环境变量。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetModelSettings}
                className="inline-flex h-11 items-center rounded-[14px] border border-white/[0.08] px-4 text-sm text-slate-200 transition hover:bg-white/[0.05]"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={handleSaveModelSettings}
                className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#344967] px-4 text-sm font-medium text-white transition hover:bg-[#3d5578]"
              >
                <Save className="h-4 w-4" />
                保存设置
              </button>
            </div>
          </div>

          {settingsNotice ? (
            <div className="mt-4 rounded-[16px] bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {settingsNotice}
            </div>
          ) : null}
        </section>

        <section className="rounded-[24px] border border-white/[0.08] bg-[#151922] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-200">默认 AI 设计出图模型</label>
            <select
              value={modelSettings.defaultAiVisionImageModel}
              onChange={(event) =>
                setModelSettings((previous) => ({
                  ...previous,
                  defaultAiVisionImageModel: event.target.value,
                }))
              }
              className="h-11 max-w-[280px] rounded-[14px] border border-white/[0.08] bg-[#0f131b] px-4 text-sm text-white outline-none transition focus:border-sky-400/60"
            >
              {AI_VISION_IMAGE_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <ProviderSection
            title="豆包"
            description="AI 设计里的豆包出图链路只读取此页面设置。请确保地址与 API Key 都已填写。"
            apiBaseUrl={modelSettings.providers.doubao.apiBaseUrl}
            apiKey={modelSettings.providers.doubao.apiKey}
            imageModel={modelSettings.providers.doubao.imageModel}
            modelOptions={doubaoOptions}
            onApiBaseUrlChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  doubao: {
                    ...previous.providers.doubao,
                    apiBaseUrl: value,
                  },
                },
              }))
            }
            onApiKeyChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  doubao: {
                    ...previous.providers.doubao,
                    apiKey: value,
                  },
                },
              }))
            }
            onImageModelChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  doubao: {
                    ...previous.providers.doubao,
                    imageModel: value,
                  },
                },
              }))
            }
          />

          <ProviderSection
            title="OpenRouter"
            description='GPT 5.4 Image 2 通过 OpenRouter 按官方 chat.completions + modalities=["image","text"] 链路调用。'
            apiBaseUrl={modelSettings.providers.openrouter.apiBaseUrl}
            apiKey={modelSettings.providers.openrouter.apiKey}
            imageModel={modelSettings.providers.openrouter.imageModel}
            modelOptions={openRouterOptions}
            onApiBaseUrlChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  openrouter: {
                    ...previous.providers.openrouter,
                    apiBaseUrl: value,
                  },
                },
              }))
            }
            onApiKeyChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  openrouter: {
                    ...previous.providers.openrouter,
                    apiKey: value,
                  },
                },
              }))
            }
            onImageModelChange={(value) =>
              setModelSettings((previous) => ({
                ...previous,
                providers: {
                  ...previous.providers,
                  openrouter: {
                    ...previous.providers.openrouter,
                    imageModel: value,
                  },
                },
              }))
            }
          />
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    if (currentRoute === 'home') {
      return <HomeChatWorkspace onNavigate={onNavigate} />;
    }

    if (currentRoute === 'design') {
      return renderDesignContent();
    }

    if (currentRoute === 'admin') {
      return renderAdminContent();
    }

    if (currentRoute === 'product') {
      return (
        <div className="p-6">
          <Placeholder
            title="AI 产品"
            description="当前先保留稳定入口，后续可以继续在这条线里补产品分析、选品和商品库能力。"
          />
        </div>
      );
    }

    if (currentRoute === 'operations') {
      return (
        <div className="p-6">
          <Placeholder
            title="AI 运营"
            description="当前先保留稳定入口，后续可以继续补运营面板、内容生成和任务协作能力。"
          />
        </div>
      );
    }

    return (
      <div className="p-6">
        <Placeholder title="稳定模式" description="该页面当前使用稳定占位内容，避免编译与启动异常。" />
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0b1220] text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#0f172a] p-4">
        <h1 className="mb-4 text-lg font-semibold text-white">电商 AI</h1>
        <div className="space-y-1">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                currentRoute === item.route
                  ? 'bg-sky-500/25 text-sky-100'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">{renderContent()}</main>
    </div>
  );
}
