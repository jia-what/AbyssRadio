import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Code2, Globe, Mail } from 'lucide-react';

/**
 * 英雄区背景视频 — 本地 public/hero（Vite 以 /hero/... 访问）。
 */
export const HERO_VIDEO_SRC = '/hero/E2.mp4';

function fadeOpacity(
  el: HTMLElement,
  from: number,
  to: number,
  ms: number,
  onDone?: () => void,
) {
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    // smootherstep — 更柔的进出
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    el.style.opacity = String(from + (to - from) * s);
    if (t < 1) requestAnimationFrame(tick);
    else onDone?.();
  };
  requestAnimationFrame(tick);
}

/** 循环视频：首尾轻柔黑场过渡（约 0.4s），减轻硬切 */
function HeroLoopVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    fadingOutRef.current = false;
    video.style.opacity = '0';

    const onCanPlay = () => {
      void video.play().catch(() => {});
      fadeOpacity(video, Number(video.style.opacity) || 0, 1, 420);
    };

    const onTimeUpdate = () => {
      if (!video.duration || fadingOutRef.current) return;
      if (video.duration - video.currentTime <= 0.42) {
        fadingOutRef.current = true;
        fadeOpacity(video, Number(video.style.opacity) || 1, 0, 400);
      }
    };

    const onEnded = () => {
      video.style.opacity = '0';
      window.setTimeout(() => {
        video.currentTime = 0;
        fadingOutRef.current = false;
        void video.play().catch(() => {});
        fadeOpacity(video, 0, 1, 420);
      }, 60);
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.pause();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover object-bottom"
      src={src}
      muted
      autoPlay
      playsInline
      preload="auto"
      style={{ opacity: 0 }}
    />
  );
}

/**
 * IdleHero — 未点播主界面英雄区
 * 点播后整层淡出，封面粒子 + 歌词淡入衔接。
 */
export default function IdleHero({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="idle-hero"
          className="absolute inset-0 z-[1] overflow-hidden flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroLoopVideo src={HERO_VIDEO_SRC} />

          {/* 轻微压暗，保证白字可读；视频换了也能站得住 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 75% 60% at 50% 42%, transparent 0%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.72) 100%)',
            }}
          />

          {/* 中心内容 — 无导航、无邮箱输入 */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center -translate-y-[8%] pointer-events-none">
            <h1
              className="text-white tracking-tight whitespace-nowrap"
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 'clamp(2.75rem, 9vw, 7.5rem)',
                lineHeight: 1.05,
              }}
            >
              Abyss <em className="italic font-normal">Radio</em>
            </h1>

            <p className="mt-8 max-w-xl text-white/75 text-sm md:text-base leading-relaxed px-4">
              沉浸式听歌空间。满屏封面粒子与歌词同场，贴边唤出 AI 与歌单。
              扫码登录后点播，把声音沉进深渊里的霓虹黄昏。
            </p>

            <button
              type="button"
              className="pointer-events-auto mt-8 liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors duration-300"
              onClick={() => {
                // 功能稍后接：关于 / 宣言 / 引导等
              }}
            >
              Manifesto
            </button>
          </div>

          {/* 页底外链 — 播放栏隐藏时贴真实底部 */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center gap-4 pb-8 md:pb-10 pointer-events-none">
            {(
              [
                { Icon: Code2, label: 'GitHub', href: '#' },
                { Icon: Mail, label: '联系', href: '#' },
                { Icon: Globe, label: '主页', href: '#' },
              ] as const
            ).map(({ Icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                title={label}
                className="pointer-events-auto liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all duration-300"
                onClick={(e) => {
                  if (href === '#') e.preventDefault();
                }}
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
