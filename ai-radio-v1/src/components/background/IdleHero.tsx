import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Mail, MessageCircleWarning } from 'lucide-react';
import TourGuide from '../ui/TourGuide';

/**
 * 英雄区背景视频 — 本地 public/hero（Vite 以 /hero/... 访问）。
 */
export const HERO_VIDEO_SRC = '/hero/E1.mp4';

const GITHUB_REPO = 'https://github.com/jia-what/AbyssRadio';
const GITHUB_ISSUES = 'https://github.com/jia-what/AbyssRadio/issues';
/** QQ 邮箱 — 不用 mailto（Chrome/无邮件客户端时只会弹空白新标签） */
const CONTACT_EMAIL = '3316067677@qq.com';

/** lucide 当前包无 Github 图标, 用官方 mark SVG, 尺寸/颜色跟其余按钮一致 */
function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.537 2.865 8.387 6.839 9.748.5.095.683-.222.683-.48 0-.237-.009-.866-.013-1.7-2.782.62-3.369-1.38-3.369-1.38-.455-1.182-1.11-1.496-1.11-1.496-.908-.638.069-.625.069-.625 1.004.072 1.532 1.06 1.532 1.06.892 1.57 2.341 1.116 2.91.854.091-.662.35-1.116.636-1.372-2.22-.259-4.555-1.142-4.555-5.076 0-1.122.39-2.04 1.029-2.76-.103-.26-.446-1.302.098-2.714 0 0 .84-.276 2.75 1.055A9.3 9.3 0 0 1 12 6.84a9.3 9.3 0 0 1 2.504.346c1.909-1.331 2.748-1.055 2.748-1.055.546 1.412.203 2.454.1 2.714.64.72 1.028 1.638 1.028 2.76 0 3.944-2.338 4.814-4.566 5.067.359.318.679.945.679 1.904 0 1.374-.012 2.481-.012 2.82 0 .26.18.58.688.48A10.27 10.27 0 0 0 22 12.253C22 6.586 17.523 2 12 2Z" />
    </svg>
  );
}

type FooterLink = { key: string; label: string; href: string; icon: ReactNode };

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
  const [guideOpen, setGuideOpen] = useState(false);
  const [mailCopied, setMailCopied] = useState(false);
  const mailCopiedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (mailCopiedTimer.current) window.clearTimeout(mailCopiedTimer.current);
  }, []);

  const copyContactEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = CONTACT_EMAIL;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setMailCopied(true);
    if (mailCopiedTimer.current) window.clearTimeout(mailCopiedTimer.current);
    mailCopiedTimer.current = window.setTimeout(() => setMailCopied(false), 2200);
  };

  const footerLinks: FooterLink[] = [
    {
      key: 'github',
      label: 'GitHub 仓库',
      href: GITHUB_REPO,
      icon: <GitHubIcon size={20} />,
    },
    {
      key: 'issues',
      label: '问题反馈',
      href: GITHUB_ISSUES,
      icon: <MessageCircleWarning size={20} strokeWidth={1.75} />,
    },
  ];

  return (
    <>
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
              Abyss{' '}<em className="italic font-normal">Radio</em>
            </h1>

            <p className="mt-8 max-w-xl text-white/75 text-sm md:text-base leading-relaxed px-4">
              沉浸式听歌空间。满屏封面粒子与歌词同场，贴边唤出 AI 与歌单。
              扫码登录后点播，把声音沉进深渊里的霓虹黄昏。
            </p>

            {!guideOpen && (
              <button
                type="button"
                className="pointer-events-auto mt-8 liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors duration-300"
                onClick={() => setGuideOpen(true)}
              >
                引导
              </button>
            )}
          </div>

          {/* 页底: GitHub / Issues 反馈 / 邮箱联系 */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-4 pb-8 md:pb-10 pointer-events-none">
            {footerLinks.map((item) => (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.label}
                title={item.label}
                className="pointer-events-auto liquid-glass rounded-full w-12 h-12 shrink-0 text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-300 inline-flex items-center justify-center"
              >
                {item.icon}
              </a>
            ))}

            {/* 邮箱：toast 不能带 liquid-glass（其 position:relative / overflow:hidden 会盖掉 absolute） */}
            <div className="relative pointer-events-auto w-12 h-12 shrink-0">
              <button
                type="button"
                aria-label={`复制邮箱 ${CONTACT_EMAIL} 联系/合作`}
                title={`复制邮箱 ${CONTACT_EMAIL} 联系/合作`}
                className={`liquid-glass rounded-full w-12 h-12 inline-flex items-center justify-center transition-colors duration-300 ${
                  mailCopied
                    ? 'text-emerald-300'
                    : 'text-white/80 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => { void copyContactEmail(); }}
              >
                <span className="relative block w-5 h-5">
                  <Mail
                    size={20}
                    strokeWidth={1.75}
                    className={`absolute inset-0 m-auto transition-all duration-200 ${
                      mailCopied ? 'opacity-0 scale-50 rotate-12' : 'opacity-100 scale-100 rotate-0'
                    }`}
                  />
                  <Check
                    size={20}
                    strokeWidth={2.25}
                    className={`absolute inset-0 m-auto transition-all duration-200 ${
                      mailCopied ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-45'
                    }`}
                  />
                </span>
              </button>

              <AnimatePresence>
                {mailCopied && (
                  <motion.div
                    key="mail-toast"
                    role="status"
                    className="absolute bottom-full left-1/2 mb-3 z-30 pointer-events-none"
                    initial={{ opacity: 0, y: 10, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: 6, x: '-50%' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  >
                    <div
                      className="whitespace-nowrap rounded-xl px-3.5 py-2 text-xs text-white/90 shadow-lg"
                      style={{
                        background: 'rgba(12, 14, 20, 0.78)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        boxShadow:
                          'inset 0 1px 1px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.35)',
                        border: '1px solid rgba(255,255,255,0.14)',
                      }}
                    >
                      <span className="text-emerald-300 font-medium">已复制</span>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="text-white/75">{CONTACT_EMAIL}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* 引导浮层 — 独立于英雄层, 不随 active 卸载 */}
      <TourGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
