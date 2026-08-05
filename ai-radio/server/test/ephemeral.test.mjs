/* 第 10 项回归: 插播残留 — ephemeral 标记 + 切歌清除 */
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// 模拟 useRadioState 的队列 + playNext 清理逻辑
function makePlayer() {
  let queue = [
    { id: 'p1', title: 'A', artist: 'X' },
    { id: 'p2', title: 'B', artist: 'Y' },
    { id: 'p3', title: 'C', artist: 'Z' },
  ];
  let idx = 0;
  return {
    get queue() { return queue; },
    get idx() { return idx; },
    insert(track) {
      const incoming = { ...track, ephemeral: true };
      const cur = Math.max(0, Math.min(idx, queue.length - 1));
      queue.splice(cur + 1, 0, incoming);
      idx = cur + 1;
    },
    playNext() {
      let tracks = queue;
      if (tracks.some((t) => t.ephemeral)) {
        const cur = queue[idx];
        const nextId = queue[(idx + 1) % queue.length]?.id;
        tracks = tracks.filter((t) => !t.ephemeral);
        queue = tracks;
        const curIdx = tracks.findIndex((t) => t.id === cur?.id);
        if (curIdx >= 0) idx = curIdx;
        else {
          const ni = tracks.findIndex((t) => t.id === nextId);
          idx = ni > 0 ? ni - 1 : tracks.length - 1;
        }
        if (tracks.length === 0) return;
      }
      idx = (idx + 1) % tracks.length;
    },
    playPrev() {
      let tracks = queue;
      if (tracks.some((t) => t.ephemeral)) {
        const cur = queue[idx];
        tracks = tracks.filter((t) => !t.ephemeral);
        queue = tracks;
        const curIdx = tracks.findIndex((t) => t.id === cur?.id);
        idx = curIdx >= 0 ? curIdx : Math.max(0, Math.min(idx, tracks.length - 1));
        if (tracks.length === 0) return;
      }
      idx = (idx - 1 + tracks.length) % tracks.length;
    },
  };
}

console.log('=== 插播后队列 ===');
const p = makePlayer();
p.insert({ id: 'e1', title: '插播曲', artist: 'AI' });
check('插播曲进入队列且标记 ephemeral', p.queue[1].ephemeral === true);
check('队列长度 4 (原 3 + 插播 1)', p.queue.length === 4);

console.log('\n=== 播完/切下一首 → 插播曲清除 ===');
p.playNext();
check('切下一首后插播曲从队列移除', !p.queue.some((t) => t.id === 'e1'));
check('队列恢复 3 首', p.queue.length === 3);
check('index 指向插播后下一首 (B)', p.queue[p.idx].id === 'p2');

console.log('\n=== 插播后切上一首 → 也清除 ===');
const p2 = makePlayer();
p2.insert({ id: 'e2', title: '插播2', artist: 'AI' });
p2.playPrev();
check('切上一首后插播曲移除', !p2.queue.some((t) => t.id === 'e2'));
check('队列恢复 3 首', p2.queue.length === 3);

console.log('\n=== 空队列只有插播曲 → 清除后停止 ===');
// 构造: 队列里只有一首插播曲 (模拟无歌单时 AI 点了一首)
const p3 = {
  queue: [{ id: 'e3', title: '独播', artist: 'AI', ephemeral: true }],
  idx: 0,
  playNext() {
    let tracks = this.queue;
    if (tracks.some((t) => t.ephemeral)) {
      const cur = this.queue[this.idx];
      const nextId = this.queue[(this.idx + 1) % this.queue.length]?.id;
      tracks = tracks.filter((t) => !t.ephemeral);
      this.queue = tracks;
      const curIdx = tracks.findIndex((t) => t.id === cur?.id);
      if (curIdx >= 0) this.idx = curIdx;
      else {
        const ni = tracks.findIndex((t) => t.id === nextId);
        this.idx = ni > 0 ? ni - 1 : tracks.length - 1;
      }
      if (tracks.length === 0) return;
    }
    this.idx = (this.idx + 1) % tracks.length;
  },
};
check('独播插播在队列 (仅1首)', p3.queue.length === 1 && p3.queue[0].ephemeral === true);
p3.playNext();
check('清除后队列空', p3.queue.length === 0);

console.log('\n=== 静态断言 (代码中标记与清除) ===');
const urs = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/hooks/useRadioState.ts', import.meta.url), 'utf-8');
const typ = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/types/index.ts', import.meta.url), 'utf-8');
const app = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
check('Track 类型有 ephemeral', typ.includes('ephemeral?: boolean'));
check('insertAndPlay 透传 ephemeral', urs.includes('ephemeral: track.ephemeral'));
check('playNext 清除 ephemeral', urs.includes('tracks.some((t) => t.ephemeral)') && urs.includes('第 10 项：播完/切走时清除插播曲'));
check('playPrev 清除 ephemeral', urs.includes('playPrev = useCallback') && urs.includes('第 10 项：切走时清除插播曲'));
check('resolveLibrarySource 标记 ephemeral', urs.includes('ephemeral: true'));
check('歌单插播三处标记', app.split('ephemeral: true').length - 1 >= 3);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
