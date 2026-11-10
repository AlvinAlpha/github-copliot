export type TowerType = 'archer' | 'mage' | 'cannon' | 'barracks';
export type EnemyType = 'goblin' | 'orc' | 'wolf' | 'knight' | 'demon' | 'boss';
export type GameStatus = 'menu' | 'playing' | 'won' | 'lost';

export interface Tower {
  id: number;
  pad: number;
  type: TowerType;
  level: number;
  spent: number;
}

export interface Pad {
  x: number;
  y: number;
}

export interface EnemyDefinition {
  name: string;
  color: number;
  health: number;
  speed: number;
  reward: number;
  size: number;
}

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 600;

export const PATH: readonly Pad[] = [
  { x: -30, y: 120 }, { x: 120, y: 120 }, { x: 185, y: 210 },
  { x: 330, y: 210 }, { x: 395, y: 315 }, { x: 545, y: 315 },
  { x: 610, y: 200 }, { x: 760, y: 200 }, { x: 825, y: 350 },
  { x: 930, y: 350 }, { x: 1030, y: 350 },
];

export const PADS: readonly Pad[] = [
  { x: 95, y: 250 }, { x: 245, y: 125 }, { x: 285, y: 285 },
  { x: 455, y: 205 }, { x: 490, y: 390 }, { x: 680, y: 300 },
  { x: 720, y: 120 }, { x: 850, y: 265 }, { x: 900, y: 435 },
];

export const TOWER_COST: Record<TowerType, number> = {
  archer: 70,
  mage: 100,
  cannon: 125,
  barracks: 90,
};

export const TOWER_INFO: Record<TowerType, { name: string; icon: string; color: number; description: string }> = {
  archer: { name: '弓箭塔', icon: '➶', color: 0x78c85b, description: '快速連射，均衡輸出' },
  mage: { name: '法師塔', icon: '✦', color: 0x9c7bea, description: '魔法飛彈，無視護甲' },
  cannon: { name: '砲塔', icon: '✹', color: 0xe7a34e, description: '範圍爆炸，重創成群敵人' },
  barracks: { name: '兵營', icon: '⚔', color: 0x67b7d1, description: '派出士兵，在路線上攔截' },
};

export const ENEMIES: Record<EnemyType, EnemyDefinition> = {
  goblin: { name: '哥布林', color: 0x80bd55, health: 48, speed: 50, reward: 8, size: 12 },
  orc: { name: '獸人', color: 0xb96345, health: 112, speed: 34, reward: 14, size: 15 },
  wolf: { name: '狼騎兵', color: 0x9da7a2, health: 85, speed: 76, reward: 15, size: 14 },
  knight: { name: '裝甲騎士', color: 0x778c9c, health: 220, speed: 27, reward: 22, size: 16 },
  demon: { name: '飛行惡魔', color: 0xb769c7, health: 105, speed: 61, reward: 18, size: 13 },
  boss: { name: '遠古魔龍', color: 0x9c3d48, health: 2600, speed: 20, reward: 180, size: 29 },
};
