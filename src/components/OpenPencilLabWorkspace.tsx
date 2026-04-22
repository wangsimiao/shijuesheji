import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  createOpenPencilProject,
  deleteOpenPencilProject,
  getOpenPencilProjects,
  saveOpenPencilProject,
} from '../store';
import { OpenPencilProject } from '../types';

interface OpenPencilLabWorkspaceProps {
  onBack: () => void;
}

export default function OpenPencilLabWorkspace({ onBack }: OpenPencilLabWorkspaceProps) {
  const [projects, setProjects] = useState<OpenPencilProject[]>(() => getOpenPencilProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const refreshProjects = () => setProjects(getOpenPencilProjects());

  const handleCreate = () => {
    const project = createOpenPencilProject(projectName.trim() || 'OpenPencil 项目');
    setProjectName('');
    refreshProjects();
    setActiveProjectId(project.id);
  };

  const handleDelete = (projectId: string) => {
    if (!window.confirm('确认删除该项目吗？')) return;
    deleteOpenPencilProject(projectId);
    refreshProjects();
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  };

  const handleRenameActiveProject = (name: string) => {
    if (!activeProject) return;
    const next: OpenPencilProject = {
      ...activeProject,
      name,
      updatedAt: Date.now(),
    };
    saveOpenPencilProject(next);
    refreshProjects();
  };

  return (
    <div className="flex h-screen bg-[#0b1220] text-slate-100">
      <aside className="w-[320px] shrink-0 border-r border-white/10 bg-[#0f172a] p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 AI 设计
          </button>
        </div>

        <h2 className="text-base font-semibold">OpenPencil 实验室</h2>
        <p className="mt-1 text-xs text-slate-400">当前版本先恢复稳定，编辑能力逐步补齐。</p>

        <div className="mt-4 flex gap-2">
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="输入项目名"
            className="flex-1 rounded-md border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-md bg-sky-500 px-3 text-sm text-white hover:bg-sky-400"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 overflow-y-auto">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`rounded-lg border px-3 py-2 ${
                project.id === activeProjectId ? 'border-sky-400 bg-sky-500/10' : 'border-white/15'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveProjectId(project.id)}
                className="w-full text-left"
              >
                <div className="truncate text-sm font-medium text-white">{project.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {new Date(project.updatedAt).toLocaleString('zh-CN')}
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(project.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          ))}
          {projects.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
              还没有项目，先创建一个实验项目。
            </div>
          ) : null}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">
        {activeProject ? (
          <>
            <header className="border-b border-white/10 px-4 py-3">
              <input
                value={activeProject.name}
                onChange={(event) => handleRenameActiveProject(event.target.value)}
                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-white outline-none hover:border-white/10 focus:border-sky-400"
              />
            </header>
            <div className="flex flex-1 items-center justify-center bg-[#0a0f1a] text-center">
              <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
                <h3 className="text-lg font-semibold text-white">实验室画布已恢复可进入状态</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  当前先回退到稳定版本，避免启动报错。接下来可以在这个页面继续恢复 OpenPencil
                  的完整交互功能。
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            请选择或创建一个 OpenPencil 项目
          </div>
        )}
      </main>
    </div>
  );
}
