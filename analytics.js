// 익명 이용 기록(Mixpanel 프로젝트 "한판내기", id 4070275). 외부 스크립트 없이 HTTP로 직접 보냅니다.
// 보내지 않는 것: 이름, 직접 쓴 내기 문구, 도전장 링크의 #d= 내용(이름이 들어 있음).
// 보내는 곳: 배포 주소(github.io)에서만. 개발 서버와 ?qa 검수는 보내지 않고 메모리에만 남깁니다(?track이면 강제 전송).
const TOKEN = 'e37ca5ec418de815b6760434ecdf46e8';
const ENDPOINT = 'https://api-js.mixpanel.com/track/?ip=1';
const UID_KEY = 'hanpan.uid';
const QUEUE_KEY = 'hanpan.queue';
const OPT_KEY = 'hanpan.analytics';
const MAX_QUEUE = 200;

const params = new URLSearchParams(location.search);
const sendable = params.has('track') || (/\.github\.io$/.test(location.hostname) && !params.has('qa'));

const rid = () => {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return [...a].map((n) => n.toString(16).padStart(8, '0')).join('');
};

function uid() {
  try {
    let id = localStorage.getItem(UID_KEY);
    if (!id) { id = rid(); localStorage.setItem(UID_KEY, id); }
    return id;
  } catch {
    return 'anon';
  }
}

function os() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'Mac OS X';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Other';
}

function inApp() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/NAVER/i.test(ua)) return 'naver';
  if (/toss/i.test(ua)) return 'toss';
  return 'none';
}

let base = {};
let queue = [];
let timer = 0;
export const sent = []; // 검수용: 이번 세션에 만든 이벤트(전송 여부와 무관)

export const isEnabled = () => {
  try { return localStorage.getItem(OPT_KEY) !== 'off'; } catch { return true; }
};
export function setEnabled(on) {
  try { localStorage.setItem(OPT_KEY, on ? 'on' : 'off'); } catch { /* 저장 불가 */ }
  if (!on) { queue = []; persistQueue(); }
}

function persistQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch { /* 저장 불가 */ }
}

export function initAnalytics({ version }) {
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { queue = []; }
  let ref = '$direct';
  try { if (document.referrer) ref = new URL(document.referrer).hostname || '$direct'; } catch { /* 무시 */ }
  base = {
    token: TOKEN,
    distinct_id: uid(),
    app_version: version,
    platform: 'web',
    in_app: inApp(),
    $os: os(),
    $screen_width: screen.width,
    $screen_height: screen.height,
    $referring_domain: ref,
    $current_url: location.origin + location.pathname, // #d= 도전장 내용은 빼고 보냅니다
  };
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  if (queue.length) schedule();
}

export function track(event, props = {}) {
  if (!isEnabled()) return;
  const e = { event, properties: { ...base, ...props, time: Date.now(), $insert_id: rid() } };
  sent.push({ event, props });
  if (!sendable) return;
  queue.push(e);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persistQueue();
  schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = 0; flush(false); }, queue.length >= 10 ? 0 : 3000);
}

async function flush(leaving) {
  if (!sendable || !queue.length) return;
  const batch = queue.slice(0, 50);
  const body = `data=${encodeURIComponent(JSON.stringify(batch))}`;
  if (leaving && navigator.sendBeacon) {
    const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/x-www-form-urlencoded' }));
    if (ok) { queue = queue.slice(batch.length); persistQueue(); }
    return;
  }
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, keepalive: true });
    if (r.ok) { queue = queue.slice(batch.length); persistQueue(); if (queue.length) schedule(); }
  } catch {
    // 오프라인이면 다음 기회에 다시 보냅니다.
  }
}
