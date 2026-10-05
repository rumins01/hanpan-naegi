// 한판 점수: 게임 6개의 내 최고 기록을 같은 기준 점수로 바꿔 더한 값입니다. 토스 리더보드에는 이 합산 점수 하나만 올립니다
// (토스 리더보드는 미니앱 하나에 1개만 만들 수 있어서 게임별 랭킹을 둘 수 없음).
//
// 게임 점수 = 100 × √(내 최고 기록 ÷ 기준 기록)
//  - 기준 기록을 내면 100점. 기록이 4배가 되면 200점.
//  - 제곱근이라 한 게임만 끝없이 파는 것보다 여러 게임을 고루 하는 쪽이 점수가 잘 오릅니다.
//
// 기준 기록(RANK_REF)은 지금은 가정값입니다(사람이 1분 남짓 했을 때 낼 만한 기록을 추정).
// 지인 테스트의 이용 기록(round_ended 점수) 중앙값으로 토스 출시 전에 고칩니다.
// 출시 후에 바꾸면 이미 올라간 점수와 기준이 달라지니, 출시 뒤에는 바꾸지 않는 것을 원칙으로 합니다.
export const RANK_REF = { stairs: 60, stack: 25, arrow: 20, bridge: 15, dodge: 40, rope: 40 };

export function gamePoints(id, best) {
  const ref = RANK_REF[id];
  if (!ref || !(best > 0)) return 0;
  return Math.round(100 * Math.sqrt(best / ref));
}

export function totalPoints(bests) {
  let sum = 0;
  for (const id of Object.keys(RANK_REF)) sum += gamePoints(id, bests?.[id] || 0);
  return sum;
}
