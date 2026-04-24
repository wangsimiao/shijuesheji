import React, { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Settings2,
  Trash2,
  Video,
} from 'lucide-react';
import HomeChatWorkspace from './HomeChatWorkspace';
import { AppRoute, Project } from '../types';
import {
  createNewProject,
  deleteProject,
  getProjects,
} from '../store';

interface DashboardProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenProject: (project: Project) => void;
}

const NAV_MENU_ITEMS: Array<{ route: AppRoute; label: string }> = [
  { route: 'design', label: 'AI 设计' },
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

function DesignProjectsLoading() {
  const skeletonCards = Array.from({ length: 7 });

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      <div className="relative flex w-full max-w-[260px] justify-self-center aspect-[1.02] flex-col rounded-[20px] border border-white/[0.08] bg-[#161a24] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
        <div className="flex flex-1 items-center justify-center rounded-[14px] bg-[#0d111a]">
          <div className="ai-loader-shimmer h-12 w-12 rounded-[14px] border border-white/10 bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_0%,rgba(255,255,255,0.26)_50%,rgba(148,163,184,0.08)_100%)]" />
        </div>
      </div>

      {skeletonCards.map((_, index) => (
        <article
          key={`project-loading-${index}`}
          className="relative flex w-full max-w-[260px] justify-self-center aspect-[1.02] flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#151923] p-3 shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
        >
          <div className="relative aspect-[1.44] overflow-hidden rounded-[14px] border border-white/[0.05] bg-[#101116]">
            <div className="ai-loader-shimmer h-full w-full bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_0%,rgba(255,255,255,0.2)_50%,rgba(148,163,184,0.08)_100%)]" />
          </div>
          <div className="mt-3 space-y-2.5 px-1">
            <div className="h-3.5 w-[78%] rounded-full bg-white/10 animate-pulse" />
            <div className="h-3.5 w-[52%] rounded-full bg-white/10 animate-pulse" />
            <div className="h-3 w-[36%] rounded-full bg-white/10/80 animate-pulse" />
          </div>
        </article>
      ))}
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

export default function Dashboard({ currentRoute, onNavigate, onOpenProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);

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

  const handleCreateProject = async () => {
    const project = await createNewProject('AI 设计项目');
    onOpenProject(project);
  };

  const renderDesignContent = () => (
    <div className="h-full overflow-y-auto bg-[#070a12] p-6 [background-image:radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.2)_1px,transparent_0)] [background-size:24px_24px]">
      <div className="mx-auto max-w-[1560px]">
        <header className="relative mb-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(130deg,#101525_0%,#0d1220_45%,#0a0f19_100%)] px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-16 h-40 w-40 rounded-full bg-cyan-500/18 blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="mt-2 text-[30px] font-semibold tracking-[0.01em] text-white">
                众唯 AI 设计 v1.1
              </h2>
              <p className="mt-3 max-w-[820px] text-sm leading-7 text-slate-300">
                直接从这里继续你的画板创作，建议及时下载关键素材。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] border border-white/[0.12] bg-white/[0.06] px-4 text-sm text-slate-100 transition hover:bg-white/[0.12]"
            >
              <Settings2 className="h-4 w-4" />
              模型设置
            </button>
          </div>
        </header>

        {isProjectsLoading ? (
          <DesignProjectsLoading />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            <button
              type="button"
              onClick={() => {
                void handleCreateProject();
              }}
              className="group flex w-full max-w-[260px] justify-self-center aspect-[1.02] flex-col rounded-[20px] border border-white/[0.08] bg-[#161a24] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition hover:border-cyan-300/40 hover:bg-[#1b2030]"
            >
              <div className="flex flex-1 items-center justify-center rounded-[14px] bg-[#0d111a] text-slate-400 transition group-hover:text-slate-100">
                <div className="flex flex-col items-center gap-3">
                  <Plus className="h-10 w-10 stroke-[1.6]" />
                  <div className="text-[18px] font-semibold text-slate-200">新的画板</div>
                </div>
              </div>
            </button>

            {projects.map((project) => (
              <article
                key={project.id}
                className="group relative flex w-full max-w-[260px] justify-self-center aspect-[1.02] flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#151923] p-3 shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition hover:border-cyan-300/40 hover:bg-[#1a1f2d]"
              >
                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="flex min-h-0 flex-1 flex-col text-left"
                >
                  <div className="aspect-[1.44] overflow-hidden rounded-[14px] border border-white/[0.05] bg-[#101116]">
                    <ProjectPreview project={project} />
                  </div>

                  <div className="min-h-0 flex-1 px-1 pt-3">
                    <h3 className="line-clamp-2 text-[14px] font-semibold leading-6 text-white">
                      {project.name || '未命名画板'}
                    </h3>
                  </div>
                </button>

                <div className="mt-1 flex items-center justify-between gap-2 px-1">
                  <div className="truncate text-[11px] tracking-[0.01em] text-slate-400">
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

  const renderContent = () => {
    if (currentRoute === 'home') {
      return <HomeChatWorkspace onNavigate={onNavigate} />;
    }

    if (currentRoute === 'design') {
      return renderDesignContent();
    }

    if (currentRoute === 'product') {
      return (
        <div className="p-6">
          <Placeholder
            title="AI 产品"
            description="当前先保留稳定入口，后续可以继续在这里补产品分析、选品和商品库能力。"
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
      <aside className="hidden w-52 shrink-0 flex-col border-r border-white/10 bg-[#0f172a] p-3">
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <img src="/zhongwei-logo.svg" alt="众唯 logo" className="h-8 w-8 rounded-[9px]" />
          <h1 className="text-base font-semibold tracking-[0.01em] text-white">众唯</h1>
        </div>
        <div className="space-y-1">
          {NAV_MENU_ITEMS.map((item) => (
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
