import React, { useEffect, useState } from 'react';
import AiVisionWorkspace from './components/AiVisionWorkspace';
import Dashboard from './components/Dashboard';
import ModelSettingsPage from './components/ModelSettingsPage';
import {
  createNewProject,
  getMostRecentProject,
  getProject,
  migrateLegacyAiVisualSnapshotToProject,
} from './store';
import { AppRoute, Project } from './types';

const DEFAULT_PROJECT_NAME = 'AI 设计项目';

function ProjectBootLoader() {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[#060b14] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.2) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-[-120px] h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-[-140px] h-[340px] w-[340px] rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative w-[min(520px,92vw)] rounded-[28px] border border-white/10 bg-[#0c1320]/88 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex flex-col items-center">
          <div className="ai-loader-float relative h-32 w-32">
            <div className="absolute inset-0 rounded-full border border-cyan-200/20" />
            <div className="ai-loader-spin-slow absolute inset-2 rounded-full border-2 border-transparent border-t-cyan-300/90 border-r-cyan-300/70" />
            <div className="ai-loader-spin-reverse absolute inset-5 rounded-full border-2 border-transparent border-l-indigo-300/85 border-b-indigo-300/60" />
            <div className="absolute inset-[44%] rounded-full bg-white shadow-[0_0_28px_rgba(125,211,252,0.95)]" />
          </div>

          <h2 className="mt-6 bg-[linear-gradient(90deg,#dbeafe_0%,#7dd3fc_45%,#a5b4fc_100%)] bg-clip-text text-[27px] font-semibold tracking-[0.01em] text-transparent">
            正在加载你的创作空间
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            AI 对话、画布和项目数据正在同步，请稍候...
          </p>

          <div className="mt-6 w-full rounded-full bg-white/8 p-1.5">
            <div className="ai-loader-shimmer h-2 rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.24)_0%,rgba(56,189,248,0.92)_50%,rgba(99,102,241,0.28)_100%)]" />
          </div>

          <div className="mt-5 flex items-center gap-3 text-[12px] text-slate-300">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300/85" />
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-200/70 animate-pulse" />
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-indigo-300/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

type ParsedLocation = {
  route: AppRoute;
  projectId: string | null;
};

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseLocationPath(pathname: string): ParsedLocation {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const projectMatch = normalizedPath.match(/^\/design\/project\/([^/]+)$/i);
  if (projectMatch?.[1]) {
    return {
      route: 'ai_visual',
      projectId: decodePathSegment(projectMatch[1]).trim() || null,
    };
  }

  switch (normalizedPath) {
    case '/home':
      return { route: 'home', projectId: null };
    case '/product':
      return { route: 'product', projectId: null };
    case '/operations':
      return { route: 'operations', projectId: null };
    case '/design':
    case '/':
      return { route: 'design', projectId: null };
    case '/settings':
      return { route: 'admin', projectId: null };
    case '/openlovart':
      return { route: 'openlovart', projectId: null };
    case '/profile':
      return { route: 'profile', projectId: null };
    default:
      return { route: 'design', projectId: null };
  }
}

function buildPathByRoute(route: AppRoute, projectId?: string | null) {
  if (route === 'ai_visual') {
    const id = (projectId || '').trim();
    if (!id) return '/design';
    return `/design/project/${encodeURIComponent(id)}`;
  }
  if (route === 'admin') return '/settings';
  if (route === 'home') return '/home';
  if (route === 'product') return '/product';
  if (route === 'operations') return '/operations';
  if (route === 'openlovart') return '/openlovart';
  if (route === 'profile') return '/profile';
  return '/design';
}

export default function App() {
  const initialLocation =
    typeof window !== 'undefined'
      ? parseLocationPath(window.location.pathname)
      : { route: 'design' as AppRoute, projectId: null };
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(initialLocation.route);
  const [routeProjectId, setRouteProjectId] = useState<string | null>(initialLocation.projectId);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);

  const navigateToRoute = (route: AppRoute, projectId: string | null = null, replace = false) => {
    const nextPath = buildPathByRoute(route, projectId);
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
    setCurrentRoute(route);
    setRouteProjectId(route === 'ai_visual' ? projectId : null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parsed = parseLocationPath(window.location.pathname);
    const normalizedPath = buildPathByRoute(parsed.route, parsed.projectId);
    if (window.location.pathname !== normalizedPath) {
      window.history.replaceState({}, '', normalizedPath);
    }
    setCurrentRoute(parsed.route);
    setRouteProjectId(parsed.projectId);

    const handlePopState = () => {
      const next = parseLocationPath(window.location.pathname);
      setCurrentRoute(next.route);
      setRouteProjectId(next.projectId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentRoute !== 'ai_visual') return;

    let cancelled = false;

    async function ensureActiveProject() {
      setIsProjectLoading(true);
      try {
        let nextProject: Project | null = null;

        const targetProjectId = (routeProjectId || activeProjectId || '').trim();
        if (targetProjectId) {
          nextProject = await getProject(targetProjectId);
        }

        if (!nextProject) {
          nextProject =
            (await migrateLegacyAiVisualSnapshotToProject()) ||
            (await getMostRecentProject()) ||
            (await createNewProject(DEFAULT_PROJECT_NAME));
        }

        if (!cancelled) {
          setActiveProjectId(nextProject.id);
          setActiveProject(nextProject);
          if (routeProjectId !== nextProject.id) {
            navigateToRoute('ai_visual', nextProject.id, true);
          }
        }
      } finally {
        if (!cancelled) {
          setIsProjectLoading(false);
        }
      }
    }

    void ensureActiveProject();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, currentRoute, routeProjectId]);

  const openProject = (project: Project) => {
    setActiveProjectId(project.id);
    setActiveProject(project);
    navigateToRoute('ai_visual', project.id);
  };

  if (currentRoute === 'ai_visual') {
    if (isProjectLoading || !activeProject) {
      return <ProjectBootLoader />;
    }

    return (
      <React.Fragment key={activeProject.id}>
        <AiVisionWorkspace
          project={activeProject}
          onBack={() => navigateToRoute('design')}
          onOpenProject={openProject}
        />
      </React.Fragment>
    );
  }

  if (currentRoute === 'admin') {
    return <ModelSettingsPage onBack={() => navigateToRoute('design')} />;
  }

  return (
    <Dashboard
      currentRoute={currentRoute}
      onNavigate={(route) => navigateToRoute(route)}
      onOpenProject={openProject}
    />
  );
}
