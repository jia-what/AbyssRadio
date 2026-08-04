import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import './OptionWheelStack.css';
import type { StackCardState } from './SpatialStack';

/**
 * OptionWheelStack — OptionWheel (React Bits) 布局引擎 + 项目卡片渲染
 *
 * 将歌单/歌曲列表的滑动效果从「直排堆叠 (SpatialStack)」换成
 * 「弧形滚轮」: 选中卡片居中最大, 两侧卡片沿圆弧弯曲、倾斜、模糊、淡出,
 * 支持滚轮 / 拖拽 / 方向键平滑滚动 (指数缓动)。
 *
 * 与 SpatialStack 保持同一 props 契约 (items/activeIndex/onActiveChange/
 * renderCard), 所以 PlaylistColumn 的卡片渲染完全不用改。
 *
 * side="right" → 曲线锚定在右侧 (面板在屏幕右侧, 卡片向屏幕外弯曲)。
 */

interface OptionWheelStackProps<T extends { id: string }> {
  items: T[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  renderCard: (item: T, state: StackCardState) => ReactNode;
  /** 锚定边: 右侧歌单面板用 'right' */
  side?: 'left' | 'right';
  /** 相邻卡片中心垂直间距 (px) */
  gap?: number;
  /** 圆弧深度: 0 = 拉平成直排 */
  curve?: number;
  /** 相邻卡片夹角 (度), 越大弯曲越紧 */
  tilt?: number;
  /** 每离开中心 1 步的模糊 (px) */
  blur?: number;
  /** 每离开中心 1 步丢失的不透明度 */
  fade?: number;
  /** 最远卡片的透明度下限 */
  minOpacity?: number;
  /** 平滑时间常数 (ms), 越大越"重" */
  smoothing?: number;
  /** 是否无限循环 */
  loop?: boolean;
  /** 允许指针拖拽 */
  draggable?: boolean;
  /**
   * 渲染窗口半径: 只挂载中心 ±visible 张卡片, 其余不渲染。
   * 大列表 (上千首歌) 必须开启, 否则每帧对全部元素写样式会卡爆。
   */
  visible?: number;
  className?: string;
  onFocusItem?: (item: T) => void;
  /** 再次点击「已选中」卡片时回调（歌曲列表用来直接播放） */
  onActivateItem?: (item: T, index: number) => void;
}

export default function OptionWheelStack<T extends { id: string }>({
  items,
  activeIndex,
  onActiveChange,
  renderCard,
  side = 'right',
  gap = 88,
  curve = 1,
  tilt = 7,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  loop = false,
  draggable = true,
  visible = 6,
  className = '',
  onFocusItem,
  onActivateItem,
}: OptionWheelStackProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(activeIndex);
  const targetRef = useRef(activeIndex);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const cfgRef = useRef({});
  const onActiveChangeRef = useRef(onActiveChange);
  const onActivateItemRef = useRef(onActivateItem);
  const selectedRef = useRef(activeIndex);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef(false);
  /** 本次 activeIndex 变化是否由组件自身滚动触发 (loop 模式保持连续位置, 不重置) */
  const internalChangeRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  onActiveChangeRef.current = onActiveChange;
  onActivateItemRef.current = onActivateItem;
  cfgRef.current = {
    count: items.length,
    rowH: Math.max(gap, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
  };

  // —— 单 rAF 循环: 指数平滑位置 → 按弧线布局每个卡片 ——
  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current as {
      count: number; rowH: number; curve: number; tilt: number; blur: number; fade: number;
      minOpacity: number; side: string; loop: boolean; smoothing: number;
    };
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);
    const n = cfg.count;

    const target = targetRef.current;
    const cur = posRef.current;
    let next = cur + (target - cur) * k;
    if (Math.abs(target - next) < 0.001) next = target;
    // loop 模式归一化: 位置保持在一个列表跨度内, 防长时间滚动浮点漂移
    if (cfg.loop && n > 1) {
      const span = n * 4;
      if (Math.abs(next) > span) {
        const wrap = Math.round(next / n) * n;
        next -= wrap;
        posRef.current = next;
        targetRef.current -= wrap;
      }
    }
    posRef.current = next;

    const els = itemRefs.current;
    const mirror = cfg.side === 'right' ? -1 : 1;
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const R = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;

    for (let i = 0; i < n; i++) {
      const el = els[i];
      if (!el) continue;
      let d = i - next;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      const dist = Math.abs(d);
      let x = 0;
      let y = d * cfg.rowH;
      let rot = 0;
      if (R > 0) {
        const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
        y = R * Math.sin(ang);
        x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve;
        rot = (mirror * ang * 180) / Math.PI;
      }
      el.style.transform = `translate(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(2)}px)) rotate(${rot.toFixed(3)}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade));
      el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : 'none';
      el.style.zIndex = String(100 - dist);
      // 可点性跟「已选中索引」走, 不跟平滑位置走 —— 否则滚轮刚停下、
      // UI 已展开「播放」但 dist 仍 >0.5 时, 按钮看着能点实际 pointer-events:none
      el.style.pointerEvents = i === selectedRef.current ? 'auto' : 'none';
    }

    rafRef.current = Math.abs(target - next) < 0.001 ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const cfg = cfgRef.current as { count: number; loop: boolean };
      let v = value;
      if (!cfg.loop) v = Math.min(Math.max(v, 0), Math.max(cfg.count - 1, 0));
      if (snap) v = Math.round(v);
      targetRef.current = v;
      const idx = ((Math.round(v) % cfg.count) + cfg.count) % cfg.count;
      if (idx !== selectedRef.current) {
        selectedRef.current = idx;
        internalChangeRef.current = true;
        onActiveChangeRef.current?.(idx);
      }
      startLoop();
    },
    [startLoop],
  );

  // 滚轮 (手动注册以便非 passive)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cfg = cfgRef.current as { rowH: number };
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      const step = Math.max(-1, Math.min(1, delta / cfg.rowH));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  // 拖拽
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 落在按钮/链接上的按下不参与拖拽 — 否则 pointer capture 会把 click
    // 重定向到根元素, 按钮的 onClick 永远收不到 (播放/详情按钮失灵根因)
    const t = e.target as HTMLElement;
    if (t.closest('button, a, [role="button"]')) return;
    if (!(cfgRef.current as { draggable: boolean }).draggable) return;
    dragRef.current = { y: e.clientY, start: targetRef.current, id: e.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) {
        dragMovedRef.current = true;
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (dragMovedRef.current) {
        applyTarget(drag.start - dy / (cfgRef.current as { rowH: number }).rowH, false);
      }
    },
    [applyTarget],
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    const moved = dragMovedRef.current;
    dragRef.current = null;
    dragMovedRef.current = false;
    setIsDragging(false);
    if (moved) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  // 键盘
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let delta: number | null = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') delta = 1;
      if (delta == null) return;
      e.preventDefault();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget],
  );

  // 受控 activeIndex 外部变化 → 同步目标; 组件自身滚动产生的变化则保持连续位置
  useEffect(() => {
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    const cfg = cfgRef.current as { count: number; loop: boolean };
    const v = cfg.loop ? activeIndex : Math.min(Math.max(activeIndex, 0), Math.max(cfg.count - 1, 0));
    targetRef.current = v;
    selectedRef.current = v;
    startLoop();
  }, [activeIndex, startLoop]);

  // 点击卡片选中; 再次点击已选中项 → onActivateItem（播歌）
  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      const cfg = cfgRef.current as { count: number; loop: boolean };
      const cur = ((Math.round(targetRef.current) % Math.max(cfg.count, 1)) + Math.max(cfg.count, 1)) % Math.max(cfg.count, 1);
      if (index === selectedRef.current || index === cur) {
        const item = itemsRef.current[index];
        if (item) onActivateItemRef.current?.(item, index);
        return;
      }
      if (cfg.loop && cfg.count > 1) {
        let d = index - cur;
        if (d > cfg.count / 2) d -= cfg.count;
        else if (d < -cfg.count / 2) d += cfg.count;
        applyTarget(targetRef.current + d, true);
      } else {
        applyTarget(index, true);
      }
    },
    [applyTarget],
  );

  // 参数变化时重排
  useEffect(() => {
    applyTarget(targetRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, gap, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);

  // PULSE hook: 焦点变化通知 (与 SpatialStack 一致)
  useEffect(() => {
    const item = items[activeIndex];
    if (item && onFocusItem) onFocusItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // 卸载清理
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="Option wheel"
      className={`ow-stack${isDragging ? ' ow-stack--dragging' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => {
        const offset = i - activeIndex;
        // 循环距离 (loop 模式下最近路径)
        let dWrap = offset;
        const n = items.length;
        if (loop && n > 1) {
          dWrap = ((offset % n) + n) % n;
          if (dWrap > n / 2) dWrap -= n;
        }
        const abs = Math.abs(dWrap);
        // 渲染窗口: 远处的卡片不挂载 (大列表性能关键)
        if (abs > visible) {
          // 离开窗口时清掉 ref, 避免 rAF 写到已卸载/错位节点
          itemRefs.current[i] = null;
          return null;
        }
        const active = i === activeIndex;
        return (
          <div
            key={item.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="option"
            aria-selected={active}
            className="ow-stack__item"
            onClick={() => handleItemClick(i)}
          >
            {renderCard(item, { active, offset: dWrap, abs, index: i })}
          </div>
        );
      })}
    </div>
  );
}
