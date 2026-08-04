import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** 高亮目标的选择器; 省略 = 中心舞台 */
  selector?: string;
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
    body: '满屏封面粒子与歌词同场,贴边唤出 AI 与歌单。先认识一下界面,再点一首歌开始。',
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
    selector: '.bottom-bar, [class*="bottom"]',
    kicker: '播放控制台',
    title: '底部: 播放器',
    body: '播放后,进度、音量、歌词模式、切歌都集中在底部。悬停音量条还有弹性手感。',
  },
  {
    kicker: '开始聆听',
    title: '现在就试试',
    body: '搜索或点播一首歌:封面粒子会跟着音乐律动,歌词悬浮在 3D 空间里。',
  },
];

const GUIDE_SEEN_KEY = 'ai-radio-guide-seen';

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
    if (!s?.selector) {
      // 无 selector: 中心舞台
      const w = Math.min(640, Math.max(280, window.innerWidth - 120));
      const h = Math.min(340, Math.max(180, window.innerHeight * 0.34));
      const l = window.innerWidth / 2 - w / 2;
      const t = Math.max(90, window.innerHeight * 0.3 - h / 2);
      setRect({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h } as DOMRect);
      setCardSide('below');
      return;
    }
    const el = document.querySelector(s.selector) as HTMLElement | null;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      const r = el.getBoundingClientRect();
      // 左缘/右缘触发条: 高亮范围沿边缘拉长, 贴合"整条边缘热区"的交互语义
      const isEdgeBar = s.selector.includes('aria-label="打开 AI"') || s.selector.includes('aria-label="打开歌单"');
      const pad = isEdgeBar ? 0 : 10;
      const expanded: DOMRect = {
        left: isEdgeBar ? Math.max(4, r.left - 6) : Math.max(8, r.left - pad),
        top: isEdgeBar ? Math.max(4, r.top - 56) : Math.max(8, r.top - pad),
        width: isEdgeBar ? Math.min(window.innerWidth - 16, r.width + 12) : Math.min(window.innerWidth - 16, r.width + pad * 2),
        height: isEdgeBar ? Math.min(window.innerHeight - 8, r.height + 112) : Math.min(window.innerHeight - 16, r.height + pad * 2),
        right: Math.min(window.innerWidth - 4, r.right + 6),
        bottom: Math.min(window.innerHeight - 4, r.bottom + 56),
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

  // 定位目标: 打开时和步骤变化时重新定位
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      locate();
      setTimeout(locate, 200);
    });
    const onResize = () => locate();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open, locate]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      markGuideSeen();
      onClose();
      return;
    }
    setStepIndex((i) => i + 1);
    requestAnimationFrame(locate);
    setTimeout(locate, 180);
  }, [stepIndex, steps.length, onClose, locate]);

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

  const isEdgeStep = !!step?.selector && (step.selector.includes('aria-label="打开 AI"') || step.selector.includes('aria-label="打开歌单"'));
  const cardW = Math.min(340, window.innerWidth - 32);
  let cardX: number;
  let cardY: number;
  if (rect) {
    if (isEdgeStep) {
      // 边缘热区步骤: 卡片放高亮环右侧, 垂直与环中心对齐, 避免重叠
      cardX = Math.min(window.innerWidth - cardW - 16, rect.right + 18);
      cardY = Math.max(16, rect.top + rect.height / 2 - 120);
    } else {
      cardX = Math.max(16, Math.min(window.innerWidth - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
      cardY = cardSide === 'below' ? rect.bottom + 18 : Math.max(16, rect.top - 210);
    }
  } else {
    cardX = 16;
    cardY = 80;
  }

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
          {/* 遮罩: 目标处挖洞 */}
          <div
            className="absolute inset-0"
            style={{
              background: rect
                ? `radial-gradient(circle at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 0px, transparent ${Math.min(rect.width, rect.height) / 2 - 30}px, rgba(2,4,10,0.62) ${Math.max(rect.width, rect.height) / 2 + 40}px, rgba(2,4,10,0.82) 100%)`
                : 'rgba(2,4,10,0.75)',
            }}
          />

          {/* 高亮环 */}
          {rect && (
            <motion.div
              className="absolute pointer-events-none"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                borderRadius: isEdgeStep ? '0 20px 20px 0' : 18,
                boxShadow:
                  '0 0 0 1.5px rgba(120,200,255,0.55), 0 0 26px rgba(80,180,255,0.35), 0 0 90px rgba(60,140,255,0.18)',
              }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          {/* 说明卡 */}
          <motion.div
            ref={cardRef}
            className="absolute w-[min(340px,calc(100vw-32px))] liquid-glass rounded-2xl p-5"
            style={{ left: cardX, top: cardY }}
            initial={{ opacity: 0, y: 12 }}
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
