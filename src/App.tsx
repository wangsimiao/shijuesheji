import React, { useEffect, useState } from 'react';
import AiVisionWorkspace from './components/AiVisionWorkspace';
import Dashboard from './components/Dashboard';
import {
  createNewProject,
  getMostRecentProject,
  getProject,
  migrateLegacyAiVisualSnapshotToProject,
} from './store';
import { AppRoute, Project } from './types';

const DEFAULT_PROJECT_NAME = 'AI 设计项目';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('design');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);

  useEffect(() => {
    if (currentRoute !== 'ai_visual') return;

    let cancelled = false;

    async function ensureActiveProject() {
      setIsProjectLoading(true);
      try {
        let nextProject: Project | null = null;

        if (activeProjectId) {
          nextProject = await getProject(activeProjectId);
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
  }, [activeProjectId, currentRoute]);

  const openProject = (project: Project) => {
    setActiveProjectId(project.id);
    setActiveProject(project);
    setCurrentRoute('ai_visual');
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
          onBack={() => setCurrentRoute('design')}
          onOpenProject={openProject}
        />
      </React.Fragment>
    );
  }

  return (
    <Dashboard
      currentRoute={currentRoute}
      onNavigate={setCurrentRoute}
      onOpenProject={openProject}
    />
  );
}
