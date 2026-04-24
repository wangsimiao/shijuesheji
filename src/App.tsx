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
      return (
        <div className="flex h-screen items-center justify-center bg-[#090b11] text-slate-200">
          正在打开项目...
        </div>
      );
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
