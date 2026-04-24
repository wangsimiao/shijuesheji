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

const DEFAULT_PROJECT_NAME = 'AI 设计画布';

function ProjectBootLoader() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-[#03050a]/26 backdrop-blur-[2px]" />
      <div className="relative inline-flex items-center gap-3 rounded-full border border-white/20 bg-[#121a27]/62 px-4 py-2 text-[13px] text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,0.36)]">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300/65" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-200" />
        </span>
        <span>正在加载画布...</span>
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
    return (
      <>
        {activeProject ? (
          <React.Fragment key={activeProject.id}>
            <AiVisionWorkspace
              project={activeProject}
              onBack={() => navigateToRoute('design')}
              onOpenProject={openProject}
            />
          </React.Fragment>
        ) : (
          <Dashboard
            currentRoute="design"
            onNavigate={(route) => navigateToRoute(route)}
            onOpenProject={openProject}
          />
        )}
        {(isProjectLoading || !activeProject) ? <ProjectBootLoader /> : null}
      </>
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
