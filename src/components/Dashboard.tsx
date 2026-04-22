import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import HomeChatWorkspace from './HomeChatWorkspace';
import { AppRoute, Project } from '../types';
import { createNewProject, deleteProject, getProjects } from '../store';

interface DashboardProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenProject: (project: Project) => void;
}

const MENU_ITEMS: Array<{ route: AppRoute; label: string }> = [
  { route: 'home', label: '首页' },
  { route: 'product', label: 'AI产品' },
  { route: 'operations', label: 'AI运营' },
  { route: 'design', label: 'AI设计' },
  { route: 'openpencil_lab', label: 'OpenPencil实验室' },
  { route: 'openlovart', label: 'OpenLovart' },
];

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

export default function Dashboard({ currentRoute, onNavigate, onOpenProject }: DashboardProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const projects = useMemo(() => getProjects(), [refreshToken]);

  const handleCreateProject = () => {
    const project = createNewProject(newProjectName.trim() || 'AI 设计项目');
    setNewProjectName('');
    setRefreshToken((value) => value + 1);
    onOpenProject(project);
  };

  const renderContent = () => {
    if (currentRoute === 'home') {
      return <HomeChatWorkspace onNavigate={onNavigate} />;
    }

    if (currentRoute === 'design') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">AI 设计项目</h2>
                <p className="mt-1 text-sm text-slate-400">创建并进入经典画布，继续你的设计任务。</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="输入项目名称"
                  className="w-52 rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-400"
                >
                  <Plus className="h-4 w-4" />
                  新建项目
                </button>
              </div>
            </div>

            {projects.length === 0 ? (
              <Placeholder title="暂无项目" description="先新建一个项目，即可进入经典画布编辑。" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <article key={project.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project)}
                      className="w-full text-left"
                    >
                      <h3 className="truncate text-base font-semibold text-white">{project.name}</h3>
                      <p className="mt-2 text-xs text-slate-400">
                        更新时间：{new Date(project.updatedAt).toLocaleString('zh-CN')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        画布元素：{project.items.length} · 会话：{project.sessions.length}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm('确认删除该项目吗？')) return;
                        deleteProject(project.id);
                        setRefreshToken((value) => value + 1);
                      }}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除项目
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentRoute === 'product') {
      return (
        <div className="p-6">
          <Placeholder
            title="AI产品"
            description="当前已回退到稳定模式。你后续要继续补“产品仪表盘 / 智能选品 / 产品库 / AI监控”时，我可以在这个稳定基线上继续迭代。"
          />
        </div>
      );
    }

    if (currentRoute === 'operations') {
      return (
        <div className="p-6">
          <Placeholder
            title="AI运营"
            description="当前已回退到稳定模式。后续可继续按“运营仪表盘 / 智能运营 / 商品库”方案逐步恢复。"
          />
        </div>
      );
    }

    return (
      <div className="p-6">
        <Placeholder
          title="稳定模式"
          description="该页面目前使用稳定占位内容，避免编译与启动异常。"
        />
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0b1220] text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#0f172a] p-4">
        <h1 className="mb-4 text-lg font-semibold text-white">电商AI</h1>
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
