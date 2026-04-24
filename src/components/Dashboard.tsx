import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  Ruler,
  Send,
  Settings2,
  Trash2,
  Video,
} from 'lucide-react';
import HomeChatWorkspace from './HomeChatWorkspace';
import { AiVisionLaunchIntent, AppRoute, BrandSpec, ChatInputImage, Project } from '../types';
import {
  createNewProject,
  deleteBrandSpec,
  deleteProject,
  getBrandSpecs,
  getModelSettings,
  getProjects,
  upsertBrandSpec,
} from '../store';
import {
  CHAT_IMAGE_LIMIT,
  IMAGE_MODEL_OPTIONS,
  normalizeImageModel,
  readFileAsDataUrl,
} from './ai-vision/workspace-model';

interface DashboardProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenProject: (project: Project, launchIntent?: AiVisionLaunchIntent) => void;
}

const NAV_MENU_ITEMS: Array<{ route: AppRoute; label: string }> = [
  { route: 'design', label: 'AI 设计' },
];

const PROJECTS_PER_PAGE = 11;
const HOME_IMAGE_SIZE_OPTIONS = [
  { label: '1:1', value: '800x800', pixels: '800x800' },
  { label: '9:16', value: '750x1334', pixels: '750x1334' },
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

function getDisplayModelLabel(value: string, fallbackLabel: string) {
  if (value === 'openai/gpt-5.4-image-2') return 'gpt2';
  if (value === 'doubao-seedream-5-0-260128') return '豆包 5.0';
  return fallbackLabel;
}

function HomeMenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-[#1b1e25]/98 p-2.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function HomeBrandSpecMenu({
  brandSpecs,
  activeBrandSpecId,
  onSelectBrandSpec,
  onSaveBrandSpec,
  onCreateBrandSpec,
  onDeleteBrandSpec,
}: {
  brandSpecs: BrandSpec[];
  activeBrandSpecId: string;
  onSelectBrandSpec: (brandSpecId: string) => void;
  onSaveBrandSpec: (brandSpecId: string, specText: string) => Promise<void>;
  onCreateBrandSpec: (brandName: string) => Promise<void>;
  onDeleteBrandSpec: (brandSpecId: string) => Promise<void>;
}) {
  const [selectedBrandSpecId, setSelectedBrandSpecId] = useState(activeBrandSpecId);
  const [specTextDraft, setSpecTextDraft] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  useEffect(() => {
    const nextId =
      activeBrandSpecId && brandSpecs.some((item) => item.id === activeBrandSpecId)
        ? activeBrandSpecId
        : '';
    setSelectedBrandSpecId(nextId);
  }, [activeBrandSpecId, brandSpecs]);

  const selectedBrandSpec = useMemo(
    () => brandSpecs.find((item) => item.id === selectedBrandSpecId) || null,
    [brandSpecs, selectedBrandSpecId]
  );

  useEffect(() => {
    setSpecTextDraft(selectedBrandSpec?.specText || '');
  }, [selectedBrandSpec]);

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <HomeMenuPanel>
        <div className="space-y-2">
          <select
            value={selectedBrandSpecId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedBrandSpecId(nextId);
              onSelectBrandSpec(nextId);
            }}
            className="h-9 w-full rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 text-[12px] text-white outline-none"
          >
            <option value="">不使用品牌规范</option>
            {brandSpecs.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.brandName}
              </option>
            ))}
          </select>

          <textarea
            value={specTextDraft}
            onChange={(event) => setSpecTextDraft(event.target.value)}
            rows={8}
            placeholder="维护当前品牌规范..."
            className="w-full resize-none rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-slate-500"
          />

          <button
            type="button"
            disabled={!selectedBrandSpec}
            onClick={() => {
              if (!selectedBrandSpec) return;
              void onSaveBrandSpec(selectedBrandSpec.id, specTextDraft);
            }}
            className="inline-flex h-9 w-full items-center justify-center rounded-[12px] bg-white/[0.08] text-[12px] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          >
            保存规范
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <input
            value={newBrandName}
            onChange={(event) => setNewBrandName(event.target.value)}
            placeholder="新增品牌名"
            className="h-9 flex-1 rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 text-[12px] text-white outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => {
              const nextName = newBrandName.trim();
              if (!nextName) return;
              void onCreateBrandSpec(nextName);
              setNewBrandName('');
            }}
            className="inline-flex h-9 items-center justify-center rounded-[12px] bg-white/[0.08] px-3 text-[12px] text-white transition hover:bg-white/[0.12]"
          >
            新增
          </button>
        </div>

        {selectedBrandSpec ? (
          <button
            type="button"
            onClick={() => {
              void onDeleteBrandSpec(selectedBrandSpec.id);
            }}
            className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-[12px] border border-rose-300/30 bg-rose-500/10 text-[12px] text-rose-100 transition hover:bg-rose-500/15"
          >
            删除当前品牌规范
          </button>
        ) : null}
      </HomeMenuPanel>
    </div>
  );
}

function HomeSizeConfigMenu({
  activeSizeId,
  onSelectSize,
}: {
  activeSizeId: string;
  onSelectSize: (sizeId: string) => void;
}) {
  const customSizeMatch = activeSizeId.match(/^(\d{2,5})x(\d{2,5})$/i);
  const [customWidth, setCustomWidth] = useState(customSizeMatch?.[1] || '');
  const [customHeight, setCustomHeight] = useState(customSizeMatch?.[2] || '');
  const customSizeValue =
    customWidth.trim() && customHeight.trim() ? `${customWidth.trim()}x${customHeight.trim()}` : '';
  const canApplyCustomSize = /^\d{2,5}x\d{2,5}$/i.test(customSizeValue);

  return (
    <HomeMenuPanel>
      <div className="mb-2 flex items-center gap-2 border-b border-white/[0.06] pb-2">
        <Ruler className="h-4 w-4 text-cyan-300" />
        <span className="text-[12px] font-medium text-white">生图尺寸</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {HOME_IMAGE_SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelectSize(option.value)}
            className={`flex flex-col items-center rounded-[10px] px-2 py-1.5 text-[11px] transition ${
              activeSizeId === option.value
                ? 'bg-cyan-500/15 text-cyan-100'
                : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-[9px] text-slate-500">{option.pixels}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <input
          value={customWidth}
          onChange={(event) => setCustomWidth(event.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="宽"
          className="h-9 min-w-0 rounded-[10px] border border-white/[0.06] bg-[#151920] px-2 text-center text-[12px] text-white outline-none placeholder:text-slate-500"
        />
        <span className="text-[11px] text-slate-500">x</span>
        <input
          value={customHeight}
          onChange={(event) => setCustomHeight(event.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="高"
          className="h-9 min-w-0 rounded-[10px] border border-white/[0.06] bg-[#151920] px-2 text-center text-[12px] text-white outline-none placeholder:text-slate-500"
        />
      </div>
      <button
        type="button"
        disabled={!canApplyCustomSize}
        onClick={() => onSelectSize(customSizeValue)}
        className={`mt-1.5 w-full rounded-[10px] px-3 py-1.5 text-[11px] transition ${
          activeSizeId === customSizeValue && customSizeValue
            ? 'bg-cyan-500/15 text-cyan-100'
            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        使用自定义尺寸
      </button>
      <button
        type="button"
        onClick={() => onSelectSize('')}
        className={`mt-2 w-full rounded-[10px] px-3 py-1.5 text-[11px] transition ${
          !activeSizeId
            ? 'bg-cyan-500/15 text-cyan-100'
            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        不指定尺寸
      </button>
    </HomeMenuPanel>
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
  const [currentPage, setCurrentPage] = useState(1);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [launchPrompt, setLaunchPrompt] = useState('');
  const [launchImages, setLaunchImages] = useState<ChatInputImage[]>([]);
  const [launchModel, setLaunchModel] = useState(() =>
    normalizeImageModel(getModelSettings().defaultAiVisionImageModel)
  );
  const [launchBrandSpecs, setLaunchBrandSpecs] = useState<BrandSpec[]>([]);
  const [launchBrandSpecId, setLaunchBrandSpecId] = useState('');
  const [launchSizeId, setLaunchSizeId] = useState('');
  const [isLaunchModelMenuOpen, setIsLaunchModelMenuOpen] = useState(false);
  const [isLaunchBrandSpecMenuOpen, setIsLaunchBrandSpecMenuOpen] = useState(false);
  const [isLaunchSizeMenuOpen, setIsLaunchSizeMenuOpen] = useState(false);
  const [isLaunchingProject, setIsLaunchingProject] = useState(false);
  const launchUploadInputRef = useRef<HTMLInputElement | null>(null);
  const launchModelMenuRef = useRef<HTMLDivElement | null>(null);
  const launchBrandSpecMenuRef = useRef<HTMLDivElement | null>(null);
  const launchSizeMenuRef = useRef<HTMLDivElement | null>(null);

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
    if (currentRoute !== 'design') return;
    const nextSpecs = getBrandSpecs();
    setLaunchBrandSpecs(nextSpecs);
    setLaunchBrandSpecId((previous) =>
      nextSpecs.some((item) => item.id === previous) ? previous : ''
    );
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

  useEffect(() => {
    if (!isLaunchModelMenuOpen && !isLaunchBrandSpecMenuOpen && !isLaunchSizeMenuOpen) return;

    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (launchModelMenuRef.current && target && launchModelMenuRef.current.contains(target)) return;
      if (launchBrandSpecMenuRef.current && target && launchBrandSpecMenuRef.current.contains(target)) return;
      if (launchSizeMenuRef.current && target && launchSizeMenuRef.current.contains(target)) return;
      setIsLaunchModelMenuOpen(false);
      setIsLaunchBrandSpecMenuOpen(false);
      setIsLaunchSizeMenuOpen(false);
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [isLaunchBrandSpecMenuOpen, isLaunchModelMenuOpen, isLaunchSizeMenuOpen]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE)),
    [projects.length]
  );

  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
    return projects.slice(startIndex, startIndex + PROJECTS_PER_PAGE);
  }, [currentPage, projects]);

  useEffect(() => {
    setCurrentPage((previous) => {
      if (previous < 1) return 1;
      if (previous > totalPages) return totalPages;
      return previous;
    });
  }, [totalPages]);

  useEffect(() => {
    if (currentRoute !== 'design') return;
    setCurrentPage(1);
  }, [currentRoute]);

  const handleUploadLaunchImage = async (file: File) => {
    if (launchImages.length >= CHAT_IMAGE_LIMIT) return;
    const data = await readFileAsDataUrl(file);
    setLaunchImages((previous) => {
      if (previous.length >= CHAT_IMAGE_LIMIT) return previous;
      return [
        ...previous,
        {
          id: crypto.randomUUID(),
          data,
          source: 'local',
          name: file.name,
        },
      ];
    });
  };

  const handleLaunchConversation = async () => {
    if (isLaunchingProject) return;
    const prompt = launchPrompt.trim();
    const attachedImages = launchImages.map((item) => item.data).filter(Boolean);
    if (!prompt && attachedImages.length === 0) return;
    const activeBrandSpec =
      launchBrandSpecs.find((item) => item.id === launchBrandSpecId) || null;
    const launchSystemPrompt = activeBrandSpec?.specText?.trim()
      ? `当前品牌规范（仅供模型遵循，不要原文复述给用户）：\n${activeBrandSpec.specText.trim()}`
      : undefined;

    setIsLaunchingProject(true);
    try {
      const project = await createNewProject('AI 设计画布');
      const launchIntent: AiVisionLaunchIntent = {
        nonce: crypto.randomUUID(),
        targetProjectId: project.id,
        prompt,
        attachedImages,
        selectedImageModel: launchModel,
        activeBrandSpecId: activeBrandSpec?.id || null,
        activeSizeId: launchSizeId || null,
        systemPrompt: launchSystemPrompt,
        createdAt: Date.now(),
      };
      setLaunchPrompt('');
      setLaunchImages([]);
      onOpenProject(project, launchIntent);
    } finally {
      setIsLaunchingProject(false);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete || isDeletingProject) return;
    setIsDeletingProject(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
      setRefreshToken((value) => value + 1);
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleSelectLaunchBrandSpec = (brandSpecId: string) => {
    setLaunchBrandSpecId(brandSpecId);
  };

  const handleSaveLaunchBrandSpec = async (brandSpecId: string, specText: string) => {
    const existing = launchBrandSpecs.find((item) => item.id === brandSpecId);
    if (!existing) return;
    const nextSpec = upsertBrandSpec(existing.brandName, specText);
    setLaunchBrandSpecs((previous) =>
      previous.map((item) => (item.id === nextSpec.id ? nextSpec : item))
    );
    setLaunchBrandSpecId(nextSpec.id);
  };

  const handleCreateLaunchBrandSpec = async (brandName: string) => {
    const trimmedName = brandName.trim();
    if (!trimmedName) return;
    const nextSpec = upsertBrandSpec(trimmedName, '');
    setLaunchBrandSpecs((previous) => {
      const withoutDuplicate = previous.filter((item) => item.id !== nextSpec.id);
      return [nextSpec, ...withoutDuplicate];
    });
    setLaunchBrandSpecId(nextSpec.id);
  };

  const handleDeleteLaunchBrandSpec = async (brandSpecId: string) => {
    const nextSpecs = deleteBrandSpec(brandSpecId);
    setLaunchBrandSpecs(nextSpecs);
    setLaunchBrandSpecId((previous) =>
      previous === brandSpecId
        ? nextSpecs.find((item) => item.id === previous)?.id || ''
        : previous
    );
  };

  const renderDesignContent = () => {
    const canLaunch = !isLaunchingProject && (launchPrompt.trim().length > 0 || launchImages.length > 0);
    const displayBrandSpecName =
      launchBrandSpecs.find((item) => item.id === launchBrandSpecId)?.brandName || '\u54c1\u724c\u89c4\u8303';
    const displaySizeLabel =
      HOME_IMAGE_SIZE_OPTIONS.find((item) => item.value === launchSizeId)?.label || '\u5c3a\u5bf8';
    const normalizedBrandSpecName =
      launchBrandSpecs.find((item) => item.id === launchBrandSpecId)?.brandName || '品牌规范';
    const normalizedSizeLabel =
      HOME_IMAGE_SIZE_OPTIONS.find((item) => item.value === launchSizeId)?.label || '尺寸';
    const launchActiveBrandName =
      launchBrandSpecs.find((item) => item.id === launchBrandSpecId)?.brandName || '未选择';
    const resolvedLaunchSizeLabel =
      HOME_IMAGE_SIZE_OPTIONS.find((item) => item.value === launchSizeId)?.label || launchSizeId || '尺寸';
    const activeBrandSpecName =
      launchBrandSpecs.find((item) => item.id === launchBrandSpecId)?.brandName || '鍝佺墝瑙勮寖';
    const activeSizeLabel =
      HOME_IMAGE_SIZE_OPTIONS.find((item) => item.value === launchSizeId)?.label || '灏哄';
    return (
      <div className="h-full overflow-y-auto bg-[#070a12] p-6 [background-image:radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.2)_1px,transparent_0)] [background-size:24px_24px]">
        <div className="mx-auto max-w-[1560px]">
          <header className="relative z-[120] mb-6 px-6 pt-2">

            <div className="relative">
              <div className="mx-auto -mt-1 max-w-[860px] text-center">
                <h2 className="relative mt-1 text-[22px] font-semibold tracking-[0.01em] text-transparent md:text-[24px]" aria-label="众唯 AI 设计">
                  <span className="pointer-events-none absolute inset-0 text-white">电商爆款，图由你生</span>
                  电商爆款，图由你生
                </h2>
                <p className="mx-auto mt-2 max-w-[820px] text-[13px] leading-6 text-slate-300">
                  发起对话，立即体验众唯1.3
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/[0.12] bg-white/[0.06] px-4 text-sm text-slate-100 transition hover:bg-white/[0.12] md:absolute md:right-0 md:top-0 md:mt-0"
              >
                <Settings2 className="h-4 w-4" />
                模型设置
              </button>
            </div>

            <div className="relative isolate mt-3 flex justify-center overflow-visible py-3">
              <div className="home-chat-line-sweep pointer-events-none absolute left-0 right-0 top-1/2 z-0 h-px -translate-y-1/2" />
              <div className="relative z-10 w-full max-w-[860px] rounded-[24px] border border-white/[0.08] bg-[#171b22]/82 p-2.5 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {launchImages.map((item) => (
                    <div key={item.id} className="group relative h-10 w-10 shrink-0">
                      <img
                        src={item.data}
                        alt={item.name || '参考图'}
                        className="h-full w-full rounded-[12px] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setLaunchImages((previous) =>
                            previous.filter((current) => current.id !== item.id)
                          )
                        }
                        className="absolute -right-1 -top-1 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
                        aria-label="移除参考图"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={launchImages.length >= CHAT_IMAGE_LIMIT || isLaunchingProject}
                    onClick={() => launchUploadInputRef.current?.click()}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.08] text-slate-200 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
                    title="上传参考图"
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </button>
                </div>

                <textarea
                  value={launchPrompt}
                  onChange={(event) => setLaunchPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleLaunchConversation();
                    }
                  }}
                  onPaste={(event) => {
                    const items = event.clipboardData?.items;
                    if (!items) return;
                    for (let index = 0; index < items.length; index += 1) {
                      const item = items[index];
                      if (item.kind === 'file' && item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (!file) continue;
                        event.preventDefault();
                        void handleUploadLaunchImage(file);
                        break;
                      }
                    }
                  }}
                  rows={2}
                  placeholder="描述你希望生成或修改的内容..."
                  className="min-h-[44px] w-full resize-none bg-transparent px-1.5 py-0.5 text-[13px] leading-5 text-white outline-none placeholder:text-slate-500"
                />

                <div className="mt-2 flex items-center gap-1.5 px-0.5">
                  <div ref={launchModelMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLaunchBrandSpecMenuOpen(false);
                        setIsLaunchSizeMenuOpen(false);
                        setIsLaunchModelMenuOpen((previous) => !previous);
                      }}
                      className="inline-flex h-9 min-w-[92px] items-center justify-between gap-1 rounded-[12px] border border-white/[0.04] bg-[#151920] px-2.5 text-[12px] text-white transition hover:bg-[#1a1f28]"
                    >
                      {getDisplayModelLabel(
                        launchModel,
                        IMAGE_MODEL_OPTIONS.find((option) => option.value === launchModel)?.label || '妯″瀷'
                      )}
                      <ChevronDown className={`h-3 w-3 transition ${isLaunchModelMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isLaunchModelMenuOpen ? (
                      <div className="absolute left-0 top-full z-[200] mt-3 w-[172px]">
                        <HomeMenuPanel>
                          <div className="space-y-1">
                            {IMAGE_MODEL_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setLaunchModel(option.value);
                                  setIsLaunchModelMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-[12px] transition ${
                                  option.value === launchModel
                                    ? 'bg-cyan-500/15 text-cyan-100'
                                    : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
                                }`}
                              >
                                {getDisplayModelLabel(option.value, option.label)}
                              </button>
                            ))}
                          </div>
                        </HomeMenuPanel>
                      </div>
                    ) : null}
                  </div>

                  <div ref={launchBrandSpecMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLaunchModelMenuOpen(false);
                        setIsLaunchSizeMenuOpen(false);
                        setIsLaunchBrandSpecMenuOpen((previous) => !previous);
                      }}
                      className={`inline-flex h-9 items-center gap-1 rounded-[12px] border px-3 text-[12px] transition ${
                        launchBrandSpecId
                          ? 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                          : 'border-white/[0.04] bg-[#151920] text-slate-200 hover:bg-[#1a1f28]'
                      }`}
                    >
                      {launchActiveBrandName}规范
                      <ChevronDown className={`h-3 w-3 transition ${isLaunchBrandSpecMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isLaunchBrandSpecMenuOpen ? (
                      <div className="absolute left-0 top-full z-[200] mt-3 w-[min(340px,calc(100vw-32px))]">
                        <HomeBrandSpecMenu
                          brandSpecs={launchBrandSpecs}
                          activeBrandSpecId={launchBrandSpecId}
                          onSelectBrandSpec={handleSelectLaunchBrandSpec}
                          onSaveBrandSpec={handleSaveLaunchBrandSpec}
                          onCreateBrandSpec={handleCreateLaunchBrandSpec}
                          onDeleteBrandSpec={handleDeleteLaunchBrandSpec}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div ref={launchSizeMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLaunchModelMenuOpen(false);
                        setIsLaunchBrandSpecMenuOpen(false);
                        setIsLaunchSizeMenuOpen((previous) => !previous);
                      }}
                      className={`inline-flex h-9 items-center gap-1 rounded-[12px] border px-3 text-[12px] transition ${
                        launchSizeId
                          ? 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                          : 'border-white/[0.04] bg-[#151920] text-slate-200 hover:bg-[#1a1f28]'
                      }`}
                    >
                      <Ruler className="h-3.5 w-3.5" />
                      {resolvedLaunchSizeLabel}
                      <ChevronDown className={`h-3 w-3 transition ${isLaunchSizeMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isLaunchSizeMenuOpen ? (
                      <div className="absolute left-0 top-full z-[200] mt-3 w-[240px]">
                        <HomeSizeConfigMenu
                          activeSizeId={launchSizeId}
                          onSelectSize={(sizeId) => {
                            setLaunchSizeId(sizeId);
                            setIsLaunchSizeMenuOpen(false);
                          }}
                        />
                        <div className="hidden">
                          <div className="grid grid-cols-2 gap-1.5">
                            {HOME_IMAGE_SIZE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setLaunchSizeId(option.value);
                                  setIsLaunchSizeMenuOpen(false);
                                }}
                                className={`flex flex-col items-center rounded-[10px] px-2 py-1.5 text-[11px] transition ${
                                  launchSizeId === option.value
                                    ? 'bg-cyan-500/15 text-cyan-100'
                                    : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                                }`}
                              >
                                <span className="font-medium">{option.label}</span>
                                <span className="text-[9px] text-slate-500">{option.pixels}</span>
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setLaunchSizeId('');
                              setIsLaunchSizeMenuOpen(false);
                            }}
                            className={`mt-2 w-full rounded-[10px] px-3 py-1.5 text-[11px] transition ${
                              !launchSizeId
                                ? 'bg-cyan-500/15 text-cyan-100'
                                : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                            }`}
                            style={{ fontSize: 0 }}
                          >
                            <span className="text-[11px]">{'\u4e0d\u6307\u5b9a\u5c3a\u5bf8'}</span>
                            不指定尺寸
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <select
                    value={launchBrandSpecId}
                    onChange={(event) => setLaunchBrandSpecId(event.target.value)}
                    className="hidden"
                    title="品牌规范"
                  >
                    <option value="">品牌规范</option>
                    {launchBrandSpecs.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.brandName}
                      </option>
                    ))}
                  </select>

                  <select
                    value={launchSizeId}
                    onChange={(event) => setLaunchSizeId(event.target.value)}
                    className="hidden"
                    title="尺寸"
                  >
                    <option value="">尺寸</option>
                    {HOME_IMAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="ml-auto">
                    <button
                      type="button"
                      disabled={!canLaunch}
                      onClick={() => {
                        void handleLaunchConversation();
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#33435f] text-white transition hover:bg-[#3b4d6d] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="发送并进入新画布"
                    >
                      {isLaunchingProject ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {isProjectsLoading ? (
            <DesignProjectsLoading />
          ) : (
            <div className="space-y-5">
              {paginatedProjects.length === 0 ? (
                <div className="rounded-[20px] border border-white/[0.08] bg-[#121621] p-8 text-center">
                  <p className="text-sm text-slate-300">还没有历史画布，直接在上方对话框发起创作就会自动创建新画布。</p>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {paginatedProjects.map((project) => (
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
                            {project.name || '未命名画布'}
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
                                  setProjectToDelete(project);
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

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <button
                      key={`dashboard-page-${pageNumber}`}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`min-w-[38px] rounded-[10px] px-3 py-1.5 text-sm transition ${
                        pageNumber === currentPage
                          ? 'bg-sky-500/30 text-sky-100'
                          : 'border border-white/[0.1] bg-white/[0.04] text-slate-300 hover:bg-white/[0.1]'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="下一页"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <input
          ref={launchUploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            await handleUploadLaunchImage(file);
          }}
        />
      </div>
    );
  };

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

      {projectToDelete ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#030712]/55 px-4 backdrop-blur-[2px]"
          onClick={() => {
            if (isDeletingProject) return;
            setProjectToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-[20px] border border-white/[0.1] bg-[linear-gradient(140deg,#111827_0%,#0f172a_58%,#0b1120_100%)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-rose-500/12 text-rose-200">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[18px] font-semibold text-white">删除画布</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  确认删除
                  <span className="mx-1 rounded bg-white/[0.08] px-1.5 py-0.5 text-slate-100">
                    {projectToDelete.name || '未命名画布'}
                  </span>
                  吗？删除后将无法恢复。
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (isDeletingProject) return;
                  setProjectToDelete(null);
                }}
                className="inline-flex h-10 items-center justify-center rounded-[12px] border border-white/[0.14] bg-white/[0.04] px-4 text-sm text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeletingProject}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDeleteProject();
                }}
                className="inline-flex h-10 items-center justify-center rounded-[12px] bg-rose-500 px-4 text-sm font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeletingProject}
              >
                {isDeletingProject ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
