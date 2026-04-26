import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCcw, Save } from 'lucide-react';
import type { ModelSettings } from '../types';
import {
  createDefaultModelSettings,
  getModelSettings,
  saveModelSettings,
} from '../store';
import {
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GEMINI_FLASH_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
} from './ai-vision/workspace-model';

type ModelSettingsPageProps = {
  onBack: () => void;
};

const AI_VISION_IMAGE_MODEL_OPTIONS = [
  { value: OPENROUTER_GPT_IMAGE_MODEL, label: 'gpt2（GPT 5.4 Image 2）' },
  { value: OPENROUTER_GEMINI_FLASH_IMAGE_MODEL, label: 'Gemini 3.1 Flash Image Preview' },
  { value: DOUBAO_5_IMAGE_MODEL, label: '豆包 5.0' },
];

function ProviderCard({
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
    <section className="rounded-[20px] border border-white/[0.08] bg-[#151923] p-5 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">API Base URL</span>
          <input
            value={apiBaseUrl}
            onChange={(event) => onApiBaseUrlChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-11 rounded-[12px] border border-white/[0.08] bg-[#101116] px-4 text-sm text-white outline-none transition focus:border-cyan-300/70"
            placeholder="请输入接口地址"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            autoComplete="new-password"
            name={`${title}-api-key`}
            spellCheck={false}
            className="h-11 rounded-[12px] border border-white/[0.08] bg-[#101116] px-4 text-sm text-white outline-none transition focus:border-cyan-300/70"
            placeholder="请输入 API Key"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">图片模型</span>
          <select
            value={imageModel}
            onChange={(event) => onImageModelChange(event.target.value)}
            className="h-11 rounded-[12px] border border-white/[0.08] bg-[#101116] px-4 text-sm text-white outline-none transition focus:border-cyan-300/70"
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

export default function ModelSettingsPage({ onBack }: ModelSettingsPageProps) {
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => createDefaultModelSettings());
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  useEffect(() => {
    setModelSettings(getModelSettings());
  }, []);

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
      AI_VISION_IMAGE_MODEL_OPTIONS.filter(
        (option) =>
          option.value === OPENROUTER_GPT_IMAGE_MODEL ||
          option.value === OPENROUTER_GEMINI_FLASH_IMAGE_MODEL
      ),
    []
  );

  const handleSaveModelSettings = () => {
    saveModelSettings(modelSettings);
    setModelSettings(getModelSettings());
    setSettingsNotice('模型设置已保存');
  };

  const handleResetModelSettings = () => {
    setModelSettings(createDefaultModelSettings());
    setSettingsNotice('已恢复默认配置，记得点击保存');
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#070a12] p-6 text-slate-100 [background-image:radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.2)_1px,transparent_0)] [background-size:24px_24px]">
      <div className="mx-auto w-full max-w-[1560px] space-y-6">
        <section className="relative mb-6 rounded-[20px] border border-white/[0.08] bg-[#121621] px-6 py-5 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="mt-1 text-[0px] font-semibold tracking-[0.01em] text-white">
                <span className="text-[24px]">模型配置</span>
                模型连接配置中心
              </h1>
              <p className="mt-3 max-w-[820px] text-sm leading-7 text-slate-300">
                这里统一管理 AI 设计的出图模型。你保存后，画布和对话侧栏会读取同一份配置。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/[0.12] bg-white/[0.06] px-4 text-sm text-slate-100 transition hover:bg-white/[0.12]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回 AI 设计
              </button>
              <button
                type="button"
                onClick={handleResetModelSettings}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/[0.12] bg-white/[0.06] px-4 text-sm text-slate-100 transition hover:bg-white/[0.12]"
              >
                <RefreshCcw className="h-4 w-4" />
                恢复默认
              </button>
              <button
                type="button"
                onClick={handleSaveModelSettings}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#2f6bff] px-4 text-sm font-medium text-white transition hover:bg-[#3b78ff]"
              >
                <Save className="h-4 w-4" />
                保存设置
              </button>
            </div>
          </div>

          {settingsNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {settingsNotice}
            </div>
          ) : null}
        </section>

        <section className="rounded-[20px] border border-white/[0.08] bg-[#151923] p-5 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">默认 AI 设计出图模型</span>
            <select
              value={modelSettings.defaultAiVisionImageModel}
              onChange={(event) =>
                setModelSettings((previous) => ({
                  ...previous,
                  defaultAiVisionImageModel: event.target.value,
                }))
              }
              className="h-11 max-w-[320px] rounded-[12px] border border-white/[0.08] bg-[#101116] px-4 text-sm text-white outline-none transition focus:border-cyan-300/70"
            >
              {AI_VISION_IMAGE_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <ProviderCard
            title="豆包"
            description="豆包出图请求会读取这里的 API Base URL 和 API Key。"
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

          <ProviderCard
            title="OpenRouter"
            description='gpt2（openai/gpt-5.4-image-2）按 chat/completions + modalities=["image","text"] 方式调用。'
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
}
