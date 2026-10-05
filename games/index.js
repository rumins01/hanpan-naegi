// 게임 목록. 홈 화면 순서이자 도전장 링크의 게임 id입니다. id는 바꾸지 마세요.
import rope from './rope.js';
import stack from './stack.js';
import bridge from './bridge.js';
import stairs from './stairs.js';
import dodge from './dodge.js';
import arrow from './arrow.js';

export const GAMES = [stairs, stack, arrow, bridge, dodge, rope];
export const byId = (id) => GAMES.find((g) => g.id === id) || null;
