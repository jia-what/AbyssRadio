import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * TourGuide — 新手引导 (Mineradio visual-guide 思路, React 版)
 *
 * 结构: 全屏遮罩(目标处挖洞) + 高亮环 + 说明卡(kicker/title/body)
 * 交互: 下一步 / 跳过 / 点击空白继续; 完成后记 localStorage, 下次不再自动弹。
 *
 * 步骤用 CSS selector 定位目标元素; 找不到目标时回退到屏幕中央。
 */

export interface GuideStep {
  /** 高亮目标的选择器; 省略 = 全屏框选 */
  selector?: string;
  /** 特殊定位区域: 'bottom' = 屏幕底部播放栏区域 (未点播时播放栏不渲染, 用区域兜底) */
  zone?: 'bottom';
  /** 引导标签, 如 "01 / Welcome" */
  kicker: string;
  title: string;
  body: string;
}

interface TourGuideProps {
  open: boolean;
  onClose: () => void;
  steps?: GuideStep[];
}

const DEFAULT_STEPS: GuideStep[] = [
  {
    kicker: 'Welcome',
    title: 'Abyss Radio — 沉浸式听歌空间',
    body: '欢迎！你现在看到的界面是 Abyss Radio 主界面，扫码登录后即可播放歌曲。',
  },
  {
    selector: 'button[aria-label="打开 AI"]',
    kicker: 'AI 信号台',
    title: '左侧: AI 对话',
    body: '鼠标移到屏幕左缘,AI 对话面板会滑出来。可以发消息让它帮你找歌、切歌、聊歌单。',
  },
  {
    selector: 'button[aria-label="打开歌单"]',
    kicker: '歌单',
    title: '右侧: 歌单与登录',
    body: '贴右缘唤出歌单面板,扫码登录网易云/酷狗后就能同步自己的歌单,点播整张专辑。',
  },
  {
    zone: 'bottom',
    kicker: '联系方式/播放栏',
    title: '下方: 播放栏',
    body: '现在显示的是联系方式。扫码登录并播放歌曲后会弹出播放栏；鼠标移到屏幕下方，播放栏会滑出来。可以调节一系列歌曲设置。',
  },
  {
    kicker: '开始聆听',
    title: '现在就试试',
    body: '搜索或点播一首歌:封面粒子会跟着音乐律动,歌词悬浮在 3D 空间里。',
  },
];

const GUIDE_SEEN_KEY = 'ai-radio-guide-seen';
/** 左右缘高亮条宽度 / 距屏边 / 与说明卡间距 */
const EDGE_RING_W = 56;
const EDGE_INSET = 16;
const EDGE_GAP = 14;
/** 边缘步骤高亮条临时高度(随后会与卡片实测高度对齐) */
const EDGE_RING_H_FALLBACK = 228;

export function guideWasSeen() {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default function TourGuide({ open, onClose, steps = DEFAULT_STEPS }: TourGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardSide, setCardSide] = useState<'below' | 'above'>('below');
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // —— 定位目标元素 → 高亮环矩形 ——
  const locate = useCallback(() => {
    const s = steps[Math.min(stepIndex, steps.length - 1)];
    if (!s) return;
    if (s.zone === 'bottom') {
      // 底部播放栏区域: 框住屏幕底部播放栏会滑出的位置 (未点播时播放栏不渲染)
      const barW = Math.min(920, window.innerWidth - 48);
      const barH = 92;
      const l = window.innerWidth / 2 - barW / 2;
      const t = window.innerHeight - barH - 44;
      setRect({ left: l, top: t, width: barW, height: barH, right: l + barW, bottom: t + barH } as DOMRect);
      setCardSide('above');
      return;
    }
    if (!s.selector) {
      // 无 selector: 全屏框选 (欢迎/结尾步骤) — 不裁内容, 遮罩均匀压暗
      setRect({
        left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
        right: window.innerWidth, bottom: window.innerHeight,
      } as DOMRect);
      setCardSide('below');
      return;
    }
    const el = document.querySelector(s.selector) as HTMLElement | null;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      const r = el.getBoundingClientRect();
      // 左缘/右缘触发条: 高亮范围沿边缘拉长, 贴合"整条边缘热区"的交互语义
      const isEdgeBar = s.selector.includes('aria-label="打开 AI"') || s.selector.includes('aria-label="打开歌单"');
      const pad = isEdgeBar ? 0 : 10;
      const isLeftEdge = isEdgeBar && r.left < window.innerWidth / 2;
      if (isEdgeBar) {
        // 垂直居中; 若卡片已挂载则直接用实测高度, 避免先 fallback 再 sync 造成伸缩闪一下
        const cardH = cardRef.current?.getBoundingClientRect().height ?? 0;
        const h = cardH > 40 ? cardH : EDGE_RING_H_FALLBACK;
        const top = Math.max(16, Math.min(window.innerHeight - h - 16, window.innerHeight / 2 - h / 2));
        const left = isLeftEdge ? EDGE_INSET : window.innerWidth - EDGE_INSET - EDGE_RING_W;
        setRect({
          left,
          top,
          width: EDGE_RING_W,
          height: h,
          right: left + EDGE_RING_W,
          bottom: top + h,
        } as DOMRect);
        setCardSide('below');
        return;
      }
      const expanded: DOMRect = {
        left: Math.max(8, r.left - pad),
        top: Math.max(8, r.top - pad),
        width: Math.min(window.innerWidth - 16, r.width + pad * 2),
        height: Math.min(window.innerHeight - 16, r.height + pad * 2),
        right: Math.min(window.innerWidth - 8, r.right + pad),
        bottom: Math.min(window.innerHeight - 8, r.bottom + pad),
      } as DOMRect;
      setRect(expanded);
      // 卡片放目标下方; 放不下放上方
      setCardSide(expanded.bottom + 190 < window.innerHeight - 20 ? 'below' : 'above');
      return;
    }
    // 目标未找到: 屏幕中央占位
    const fallback: DOMRect = {
      left: window.innerWidth / 2 - 120,
      top: window.innerHeight / 2 - 60,
      width: 240,
      height: 120,
      right: window.innerWidth / 2 + 120,
      bottom: window.innerHeight / 2 + 60,
    } as DOMRect;
    setRect(fallback);
    setCardSide('below');
  }, [stepIndex, steps]);

  // 打开时重置到第一步 (只依赖 open, 不依赖 locate — 否则每次 setStepIndex
  // 都会触发 locate 重建 → effect 重跑 → 进度被打回第 0 步)
  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  // 定位目标: 打开/切步时同步定位; 边缘步不做延迟 locate (会把高度打回 fallback 造成伸缩)
  useLayoutEffect(() => {
    if (!open) return;
    const s = steps[Math.min(stepIndex, steps.length - 1)];
    const edgeStep = !!s?.selector && (s.selector.includes('打开 AI') || s.selector.includes('打开歌单'));
    // 切步先清掉上一步 rect, 避免一帧沿用全屏框尺寸
    if (edgeStep) setRect(null);
    locate();
    const t1 = edgeStep ? undefined : window.setTimeout(locate, 200);
    const onResize = () => locate();
    window.addEventListener('resize', onResize);
    return () => {
      if (t1) window.clearTimeout(t1);
      window.removeEventListener('resize', onResize);
    };
  }, [open, locate, stepIndex, steps]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      markGuideSeen();
      onClose();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, onClose]);

  const skip = useCallback(() => {
    markGuideSeen();
    onClose();
  }, [onClose]);

  // 点击空白继续
  const handleSurfaceClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      next();
    },
    [next],
  );

  const isFullscreenStep = !step?.selector && step?.zone !== 'bottom';
  const isEdgeStep = !!step?.selector && (step.selector.includes('aria-label="打开 AI"') || step.selector.includes('aria-label="打开歌单"'));
  const ringIsLeft = !!(rect && rect.left < window.innerWidth / 2);
  const cardW = Math.min(340, window.innerWidth - 32);
  let cardX: number;
  let cardY: number;
  if (rect) {
    if (isFullscreenStep) {
      cardX = Math.max(16, window.innerWidth / 2 - cardW / 2);
      cardY = Math.max(16, window.innerHeight / 2 + 40);
    } else if (step?.zone === 'bottom') {
      cardX = Math.max(16, Math.min(window.innerWidth - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
      cardY = Math.max(16, rect.top - 210);
    } else if (isEdgeStep) {
      const edgeReady = rect.width === EDGE_RING_W;
      const leftEdge = edgeReady ? ringIsLeft : !!step?.selector?.includes('打开 AI');
      cardX = leftEdge
        ? Math.min(window.innerWidth - cardW - 16, (edgeReady ? rect.right : EDGE_INSET + EDGE_RING_W) + EDGE_GAP)
        : Math.max(16, (edgeReady ? rect.left : window.innerWidth - EDGE_INSET - EDGE_RING_W) - cardW - EDGE_GAP);
      const h = edgeReady ? rect.height : EDGE_RING_H_FALLBACK;
      cardY = Math.max(16, Math.min(window.innerHeight - h - 16, window.innerHeight / 2 - h / 2));
    } else {
      cardX = Math.max(16, Math.min(window.innerWidth - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
      cardY = cardSide === 'below' ? rect.bottom + 18 : Math.max(16, rect.top - 210);
    }
  } else if (isEdgeStep) {
    // rect 清空后的一帧: 先用预估位置, 避免闪到别处
    const leftEdge = !!step?.selector?.includes('打开 AI');
    cardX = leftEdge
      ? EDGE_INSET + EDGE_RING_W + EDGE_GAP
      : window.innerWidth - EDGE_INSET - EDGE_RING_W - cardW - EDGE_GAP;
    cardY = Math.max(16, window.innerHeight / 2 - EDGE_RING_H_FALLBACK / 2);
  } else {
    cardX = 16;
    cardY = 80;
  }

  // 边缘步骤: 仅在卡片实测高度与当前 ring 不一致时对齐一次 (不再被延迟 locate 打回)
  useLayoutEffect(() => {
    if (!open || !isEdgeStep || !cardRef.current || !rect || rect.width !== EDGE_RING_W) return;
    const card = cardRef.current;
    const cr = card.getBoundingClientRect();
    if (cr.height < 40) return;
    const nextH = cr.height;
    const nextTop = Math.max(16, Math.min(window.innerHeight - nextH - 16, window.innerHeight / 2 - nextH / 2));
    if (Math.abs(rect.top - nextTop) < 0.5 && Math.abs(rect.height - nextH) < 0.5) return;
    setRect((prev) => {
      if (!prev || prev.width !== EDGE_RING_W) return prev;
      return {
        ...prev,
        top: nextTop,
        height: nextH,
        bottom: nextTop + nextH,
      } as DOMRect;
    });
  }, [open, stepIndex, isEdgeStep, rect?.width, rect?.left, rect?.height, rect?.top]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={rootRef}
          className="fixed inset-0 z-[300]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={handleSurfaceClick}
        >
          {/* 遮罩: 目标处挖洞; 全屏步骤均匀压暗 */}
          <div
            className="absolute inset-0"
            style={{
              background: rect && !isFullscreenStep
                ? `radial-gradient(ellipse at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 0px, transparent ${Math.max(rect.width, rect.height) * 0.52}px, rgba(2,4,10,0.62) ${Math.max(rect.width, rect.height) * 0.72}px, rgba(2,4,10,0.84) 100%)`
                : 'rgba(2,4,10,0.42)',
            }}
          />

          {/* 高亮环 — key 按步重置, 避免从上一步尺寸插值出伸缩感 */}
          {rect && (
            <motion.div
              key={`ring-${stepIndex}`}
              className="absolute pointer-events-none"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                borderRadius: isFullscreenStep
                  ? 0
                  : isEdgeStep
                    ? (ringIsLeft ? '0 18px 18px 0' : '18px 0 0 18px')
                    : 18,
                boxShadow: isFullscreenStep
                  ? 'inset 0 0 0 1.5px rgba(120,200,255,0.35), inset 0 0 60px rgba(80,180,255,0.10)'
                  : '0 0 0 1.5px rgba(120,200,255,0.55), 0 0 26px rgba(80,180,255,0.35), 0 0 90px rgba(60,140,255,0.18)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          )}

          {/* 说明卡 */}
          <motion.div
            ref={cardRef}
            className="absolute w-[min(340px,calc(100vw-32px))] liquid-glass rounded-2xl p-5"
            key={stepIndex}
            style={{ left: cardX, top: cardY }}
            initial={isEdgeStep ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="text-sky-300/70 text-[10px] tracking-[0.25em] uppercase mb-2">{step.kicker}</div>
            <div className="text-white/95 text-base font-medium leading-snug mb-2">{step.title}</div>
            <div className="text-white/65 text-sm leading-relaxed mb-5">{step.body}</div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={skip}
                className="text-white/35 hover:text-white/70 text-[11px] tracking-wide transition-colors duration-300"
              >
                跳过
              </button>
              <div className="text-white/30 text-[11px] tabular-nums">
                {stepIndex + 1} / {steps.length}
              </div>
              <button
                type="button"
                onClick={next}
                className="text-[11px] tracking-wide text-emerald-950/90 bg-emerald-300/85 hover:bg-emerald-300 rounded-full px-4 py-1.5 transition-colors duration-300"
              >
                {stepIndex >= steps.length - 1 ? '完成' : '下一步'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
