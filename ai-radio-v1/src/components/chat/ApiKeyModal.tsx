import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, KeyRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchDeepseekStatus,
  saveDeepseekKey,
  type DeepseekStatus,
} from '../../services/aiSettingsApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (status: DeepseekStatus) => void;
}

const PLATFORM_URL = 'https://platform.deepseek.com';
const API_KEYS_URL = 'https://platform.deepseek.com/api_keys';
const DOCS_URL = 'https://api-docs.deepseek.com';

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1 inline-flex items-center gap-1 text-blue-300/80 hover:text-blue-200 underline underline-offset-2 pointer-events-auto"
      onClick={(e) => {
        // Ensure Electron / nested overlays don't swallow the navigation.
        e.stopPropagation();
        window.open(href, '_blank', 'noopener,noreferrer');
        e.preventDefault();
      }}
    >
      {children}
      <ExternalLink size={11} />
    </a>
  );
}

export default function ApiKeyModal({ open, onClose, onSaved }: Props) {
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<DeepseekStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setOkMsg('');
    setKeyInput('');
    void fetchDeepseekStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open]);

  const handleSave = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError('请先粘贴 API Key');
      return;
    }
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      const result = await saveDeepseekKey(trimmed);
      const next = await fetchDeepseekStatus();
      setStatus(next);
      setOkMsg(result.configured ? '已保存，立即生效' : '未检测到有效 Key');
      setKeyInput('');
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError('');
    try {
      await saveDeepseekKey('');
      const next = await fetchDeepseekStatus();
      setStatus(next);
      setOkMsg('已清除 Key（仍可在歌单内点歌）');
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '清除失败');
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] cursor-default"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-title"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative z-10 w-[min(420px,calc(100vw-2rem))] rounded-2xl p-5 text-left shadow-2xl pointer-events-auto"
            style={{
              background: 'rgba(12, 14, 20, 0.92)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 16px 48px rgba(0,0,0,0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div
                  id="api-key-title"
                  className="text-white/80 text-sm font-medium tracking-wide flex items-center gap-2"
                >
                  <KeyRound size={16} className="text-blue-300/70" />
                  导入 DeepSeek API Key
                </div>
                <p className="mt-1 text-white/35 text-xs leading-relaxed">
                  粘贴后立即生效，无需重启。Key 仅保存在本机。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-white/30 hover:text-white/60 transition-colors p-1 pointer-events-auto"
                aria-label="关闭配置"
              >
                <X size={16} />
              </button>
            </div>

            <div
              className="rounded-xl px-3.5 py-3 mb-4 text-[11px] text-white/45 leading-relaxed space-y-2 pointer-events-auto"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div className="text-white/55 text-[10px] tracking-[1.5px] uppercase">获取教程</div>
              <ol className="list-decimal pl-4 space-y-1.5">
                <li>
                  打开 DeepSeek 开平台（点击即跳转）：
                  <ExtLink href={PLATFORM_URL}>platform.deepseek.com</ExtLink>
                </li>
                <li>
                  注册 / 登录后，进入 API Key 页面创建密钥：
                  <ExtLink href={API_KEYS_URL}>打开 API Keys</ExtLink>
                </li>
                <li>复制 Key，粘贴到下方输入框，点「保存并启用」。</li>
                <li>
                  官方文档（可选）：
                  <ExtLink href={DOCS_URL}>api-docs.deepseek.com</ExtLink>
                </li>
              </ol>
              <p className="text-white/25 pt-1">
                不想配 Key 也可以：先右侧扫码登录，再用「放 xxx」——只会从你的歌单里找，避免翻唱和 VIP 试听。
              </p>
            </div>

            {status?.configured && (
              <div className="mb-3 text-[11px] text-emerald-300/70">
                当前已配置：<span className="font-mono text-emerald-200/80">{status.hint}</span>
              </div>
            )}

            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              placeholder="sk- 开头的 API Key"
              className="w-full bg-black/30 border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-400/40 font-mono pointer-events-auto"
            />

            {error && <div className="mt-2 text-[11px] text-red-300/80">{error}</div>}
            {okMsg && <div className="mt-2 text-[11px] text-emerald-300/80">{okMsg}</div>}

            <div className="mt-4 flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="flex-1 rounded-full px-4 py-2.5 text-sm text-white/85 hover:bg-white/10 disabled:opacity-40 transition-colors border border-white/15 bg-white/[0.06]"
              >
                {saving ? '保存中…' : '保存并启用'}
              </button>
              {status?.configured && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleClear()}
                  className="rounded-full px-3 py-2.5 text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  清除
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
