// 웹과 앱인토스(토스 앱 안)의 차이를 이 파일에만 둡니다.
// 토스 빌드(toss/src/main.js)가 공식 SDK 함수를 globalThis.__AIT에 넣어 주면 토스 모드로 동작하고,
// 없으면 일반 웹 모드(localStorage, navigator.share, 진동 API)로 동작합니다.

export const APP_NAME = 'hanpan-naegi'; // 앱인토스 콘솔의 appName과 같아야 합니다(등록 후 바꿀 수 없음)
const AIT = () => globalThis.__AIT || null;
const QS = new URLSearchParams(location.search);

export const env = {
  get isToss() { return Boolean(AIT()); },
  get platform() { return AIT() ? 'toss' : 'web'; },
};

// ---------- 저장소: 시작할 때 한 번 읽어 메모리에 두고, 쓸 때는 메모리와 기기 저장소에 함께 씁니다 ----------
const KEYS = ['hanpan.v1', 'hanpan.uid', 'hanpan.queue', 'hanpan.analytics'];
const cache = new Map();

export async function initPlatform() {
  const ait = AIT();
  if (ait?.Storage) {
    for (const k of KEYS) {
      try {
        const v = await withTimeout(ait.Storage.getItem(k), 1000);
        if (v != null) cache.set(k, v);
        else {
          // 웹판에서 쓰던 기록이 같은 기기 웹뷰에 남아 있으면 옮겨 옵니다.
          const legacy = safeLocal(() => localStorage.getItem(k));
          if (legacy != null) { cache.set(k, legacy); ait.Storage.setItem(k, legacy).catch(() => {}); }
        }
      } catch { /* 읽기 실패는 빈 값으로 시작 */ }
    }
  } else {
    for (const k of KEYS) { const v = safeLocal(() => localStorage.getItem(k)); if (v != null) cache.set(k, v); }
  }
  try { applySafeArea(); ait?.SafeArea?.subscribe?.({ onEvent: applySafeArea }); } catch { /* 안전 영역 정보 없음 */ }
}

function safeLocal(fn) { try { return fn(); } catch { return null; } }

// 토스 브리지가 응답하지 않으면 멈추지 않고 빈 값으로 진행합니다.
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export const kv = {
  get: (key) => (cache.has(key) ? cache.get(key) : null),
  set(key, value) {
    cache.set(key, value);
    const ait = AIT();
    if (ait?.Storage) ait.Storage.setItem(key, value).catch(() => {});
    else safeLocal(() => localStorage.setItem(key, value));
    return true;
  },
};

export function loadJSON(key, fallback) {
  try {
    const raw = kv.get(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveJSON(key, value) {
  try { return kv.set(key, JSON.stringify(value)); } catch { return false; }
}

// ---------- 진동 ----------
const HAPTIC = { tick: 'tickWeak', perfect: 'tickMedium', fail: 'error', win: 'success' };
export function haptic(kind) {
  const ait = AIT();
  if (ait?.Device) { ait.Device.triggerHaptic({ type: HAPTIC[kind] || 'tap' }).catch(() => {}); return; }
  const ms = { tick: 8, perfect: 12, fail: 70, win: 30 }[kind] || 10;
  try { navigator.vibrate?.(ms); } catch { /* 진동 없는 기기 */ }
}

// ---------- 도전장 링크와 공유 ----------
export async function challengeLink(code) {
  const ait = AIT();
  if (ait?.getTossShareLink) {
    try { return await ait.getTossShareLink(`intoss://${APP_NAME}?d=${code}`); } catch { /* 웹 주소로 대신 */ }
  }
  return `${location.origin}${location.pathname}#d=${code}`;
}

// 반환값: 'shared' | 'copied' | 'failed' | 'cancelled'
export async function shareText(text) {
  const ait = AIT();
  if (ait?.Share) {
    try { await ait.Share.sendMessage({ message: text }); return 'shared'; } catch { return 'failed'; }
  }
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

// 도전장 코드: 토스 링크는 ?d=, 웹 링크는 #d=
export function challengeCode() {
  const q = QS.get('d');
  if (q) return q;
  const m = /(?:^#|&)d=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  return m ? m[1] : null;
}

export function clearChallengeCode() {
  if (QS.has('d')) return; // 토스 딥링크 쿼리는 앱이 지울 수 없으니 처리 여부를 메모리로 관리합니다
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- 화면 생명주기 ----------
export function onHidden(handler) {
  const fn = () => { if (document.hidden) handler(); };
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
}

// 안드로이드 뒤로가기(토스). 웹에서는 아무것도 하지 않습니다.
export function onBack(handler) {
  const ait = AIT();
  if (!ait?.graniteEvent) return () => {};
  try { return ait.graniteEvent.addEventListener('backEvent', { onEvent: handler, onError: () => {} }); } catch { return () => {}; }
}

export async function closeApp() {
  const ait = AIT();
  if (ait?.Screen?.close) { await ait.Screen.close(); return true; }
  return false;
}

// 게임 중에는 iOS 스와이프 뒤로가기를 막아, 좌우 조작 중 실수로 나가지 않게 합니다.
export function setSwipeBack(enabled) {
  AIT()?.Screen?.setIosSwipeBack?.({ isEnabled: enabled }).catch?.(() => {});
}

function applySafeArea() {
  const ins = AIT()?.SafeArea?.get?.();
  if (!ins) return;
  const r = document.documentElement.style;
  r.setProperty('--safe-top', `${ins.top}px`);
  r.setProperty('--safe-bottom', `${ins.bottom}px`);
}

// ---------- 광고 ----------
// 개발 중에는 반드시 테스트 광고 ID를 씁니다(실제 ID로 테스트하면 정책 위반). 출시 때 콘솔에서 받은 광고 그룹 ID로 바꿉니다.
export const AD_GROUPS = {
  interstitial: 'ait-ad-test-interstitial-id',
  rewarded: 'ait-ad-test-rewarded-id',
};

const adState = { interstitial: 'idle', rewarded: 'idle' }; // idle | loading | ready
const mockAds = QS.has('mockads'); // 웹 검수용 가짜 광고

export function adsAvailable() {
  const ait = AIT();
  if (ait?.loadFullScreenAd) { try { return ait.loadFullScreenAd.isSupported?.() !== false; } catch { return false; } }
  return mockAds;
}

export function preloadAd(kind) {
  if (!adsAvailable() || adState[kind] !== 'idle') return;
  const ait = AIT();
  if (!ait) { adState[kind] = 'ready'; return; }
  adState[kind] = 'loading';
  try {
    ait.loadFullScreenAd({
      options: { adGroupId: AD_GROUPS[kind] },
      onEvent: (e) => { if (e.type === 'loaded') adState[kind] = 'ready'; },
      onError: () => { adState[kind] = 'idle'; },
    });
  } catch { adState[kind] = 'idle'; }
}

export const adReady = (kind) => adState[kind] === 'ready';

// 반환: { shown: boolean, rewarded: boolean }. 보상은 userEarnedReward 이벤트가 왔을 때만 true입니다.
export function showAd(kind) {
  return new Promise((resolve) => {
    if (!adReady(kind)) { resolve({ shown: false, rewarded: false }); preloadAd(kind); return; }
    adState[kind] = 'idle';
    const ait = AIT();
    if (!ait) { mockAd(kind).then(resolve); return; }
    let shown = false; let rewarded = false; let done = false;
    const finish = () => { if (done) return; done = true; resolve({ shown, rewarded }); preloadAd(kind); };
    try {
      ait.showFullScreenAd({
        options: { adGroupId: AD_GROUPS[kind] },
        onEvent: (e) => {
          if (e.type === 'show' || e.type === 'impression') shown = true;
          if (e.type === 'userEarnedReward') rewarded = true;
          if (e.type === 'dismissed' || e.type === 'failedToShow') finish();
        },
        onError: finish,
      });
    } catch { finish(); }
  });
}

// 웹 검수용 가짜 광고: 3초 뒤 닫을 수 있고, 보상형은 끝까지 기다려야 보상을 줍니다.
function mockAd(kind) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mock-ad';
    el.innerHTML = '<div class="mock-ad-box"><span class="mock-ad-label">Ad</span><strong></strong><p></p><button type="button" disabled>3</button></div>';
    el.querySelector('strong').textContent = kind === 'rewarded' ? '테스트 보상형 광고' : '테스트 전면 광고';
    el.querySelector('p').textContent = '검수용 가짜 광고예요. 토스 앱에서는 실제 광고가 나와요.';
    const btn = el.querySelector('button');
    document.body.append(el);
    let left = 3;
    const t = setInterval(() => {
      left -= 1;
      if (left > 0) { btn.textContent = String(left); return; }
      clearInterval(t);
      btn.disabled = false;
      btn.textContent = '닫기';
    }, 1000);
    btn.addEventListener('click', () => { el.remove(); resolve({ shown: true, rewarded: kind === 'rewarded' }); });
  });
}
