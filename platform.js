// 웹과 앱인토스(또는 스토어 앱)의 차이를 이 파일에만 둡니다.
// 앱인토스로 옮길 때 바꿀 곳: 저장(사용자 식별키 기반 저장), 공유(getTossShareLink + share), 진동(햅틱).

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* 진동이 없는 기기 */ }
}

// 도전장 링크. 웹에서는 지금 주소 뒤에 #d=코드를 붙입니다.
// 앱인토스에서는 getTossShareLink('intoss://앱이름?d=코드')로 바꿉니다.
export function challengeUrl(code) {
  const { origin, pathname } = location;
  return `${origin}${pathname}#d=${code}`;
}

// 반환값: 'shared' | 'copied' | 'failed'. 사용자가 공유 창을 닫으면 'cancelled'.
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function onHidden(handler) {
  const fn = () => { if (document.hidden) handler(); };
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
}
