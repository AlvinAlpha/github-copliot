import { create } from 'zustand';
import type { GameStatus, Tower, TowerType } from './types';
import { TOWER_COST } from './types';

interface SaveData {
  bestWave: number;
  wins: number;
  sound: boolean;
}

interface GameState {
  status: GameStatus;
  gold: number;
  lives: number;
  wave: number;
  waveReady: boolean;
  enemiesRemaining: number;
  towers: Tower[];
  selectedPad: number | null;
  selectedTower: number | null;
  paused: boolean;
  speed: 1 | 2;
  meteorCooldown: number;
  reinforcementsCooldown: number;
  skillMode: 'meteor' | null;
  save: SaveData;
  startGame: () => void;
  selectPad: (pad: number) => void;
  selectTower: (id: number) => void;
  buildTower: (type: TowerType) => void;
  upgradeTower: () => void;
  sellTower: () => void;
  togglePause: () => void;
  toggleSpeed: () => void;
  setWave: (wave: number, remaining: number) => void;
  setWaveReady: (ready: boolean) => void;
  startWave: () => void;
  setRemaining: (remaining: number) => void;
  addGold: (amount: number) => void;
  loseLife: (amount: number) => void;
  setCooldowns: (meteor: number, reinforcements: number) => void;
  activateMeteor: () => void;
  activateReinforcements: () => void;
  useMeteor: (x: number, y: number) => void;
  finishGame: (won: boolean) => void;
  setSound: (enabled: boolean) => void;
  resetToMenu: () => void;
}

const STORAGE_KEY = 'kingdom-defender-save-v1';

function readSave(): SaveData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SaveData>;
      return {
        bestWave: typeof parsed.bestWave === 'number' ? parsed.bestWave : 0,
        wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
        sound: parsed.sound !== false,
      };
    }
  } catch (error) {
    console.error('無法讀取遊戲進度：', error);
  }
  return { bestWave: 0, wins: 0, sound: true };
}

function persist(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (error) {
    console.error('無法儲存遊戲進度：', error);
  }
}

const initialSave = readSave();

export const useGameStore = create<GameState>((set, get) => ({
  status: 'menu',
  gold: 250,
  lives: 20,
  wave: 0,
  waveReady: true,
  enemiesRemaining: 0,
  towers: [],
  selectedPad: null,
  selectedTower: null,
  paused: false,
  speed: 1,
  meteorCooldown: 0,
  reinforcementsCooldown: 0,
  skillMode: null,
  save: initialSave,
  startGame: () => {
    set({
      status: 'playing', gold: 250, lives: 20, wave: 0, waveReady: true, enemiesRemaining: 0,
      towers: [], selectedPad: null, selectedTower: null, paused: false, speed: 1,
      meteorCooldown: 0, reinforcementsCooldown: 0, skillMode: null,
    });
    window.dispatchEvent(new CustomEvent('game:new-run'));
  },
  selectPad: (pad) => set({ selectedPad: pad, selectedTower: null }),
  selectTower: (id) => set({ selectedTower: id, selectedPad: null }),
  buildTower: (type) => {
    const state = get();
    if (state.selectedPad === null || state.gold < TOWER_COST[type]) return;
    if (state.towers.some((tower) => tower.pad === state.selectedPad)) return;
    const tower: Tower = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      pad: state.selectedPad,
      type,
      level: 1,
      spent: TOWER_COST[type],
    };
    set({
      towers: [...state.towers, tower],
      gold: state.gold - TOWER_COST[type],
      selectedTower: tower.id,
      selectedPad: null,
    });
  },
  upgradeTower: () => {
    const state = get();
    const tower = state.towers.find((item) => item.id === state.selectedTower);
    if (!tower || tower.level >= 3) return;
    const cost = Math.round(TOWER_COST[tower.type] * (tower.level === 1 ? 0.8 : 1.2));
    if (state.gold < cost) return;
    set({
      gold: state.gold - cost,
      towers: state.towers.map((item) => item.id === tower.id
        ? { ...item, level: item.level + 1, spent: item.spent + cost }
        : item),
    });
  },
  sellTower: () => {
    const state = get();
    const tower = state.towers.find((item) => item.id === state.selectedTower);
    if (!tower) return;
    set({
      gold: state.gold + Math.floor(tower.spent * 0.6),
      towers: state.towers.filter((item) => item.id !== tower.id),
      selectedTower: null,
    });
  },
  togglePause: () => set((state) => ({ paused: !state.paused })),
  toggleSpeed: () => set((state) => ({ speed: state.speed === 1 ? 2 : 1 })),
  setWave: (wave, remaining) => set({ wave, enemiesRemaining: remaining, waveReady: false }),
  setWaveReady: (waveReady) => set({ waveReady }),
  startWave: () => {
    if (get().waveReady && get().status === 'playing') {
      window.dispatchEvent(new CustomEvent('game:start-wave'));
    }
  },
  setRemaining: (enemiesRemaining) => {
    if (get().enemiesRemaining !== enemiesRemaining) set({ enemiesRemaining });
  },
  addGold: (amount) => set((state) => ({ gold: state.gold + amount })),
  loseLife: (amount) => set((state) => {
    const lives = Math.max(0, state.lives - amount);
    return { lives, status: lives === 0 ? 'lost' : state.status };
  }),
  setCooldowns: (meteorCooldown, reinforcementsCooldown) => {
    const state = get();
    if (Math.ceil(state.meteorCooldown) !== Math.ceil(meteorCooldown)
      || Math.ceil(state.reinforcementsCooldown) !== Math.ceil(reinforcementsCooldown)) {
      set({ meteorCooldown, reinforcementsCooldown });
    }
  },
  activateMeteor: () => {
    if (get().meteorCooldown <= 0) set({ skillMode: 'meteor' });
  },
  activateReinforcements: () => {
    if (get().reinforcementsCooldown <= 0) {
      set({ reinforcementsCooldown: 30 });
      window.dispatchEvent(new CustomEvent('game:reinforcements'));
    }
  },
  useMeteor: (x, y) => {
    if (get().skillMode === 'meteor') {
      set({ skillMode: null, meteorCooldown: 45 });
      window.dispatchEvent(new CustomEvent('game:meteor', { detail: { x, y } }));
    }
  },
  finishGame: (won) => set((state) => {
    const save = {
      ...state.save,
      bestWave: Math.max(state.save.bestWave, state.wave),
      wins: state.save.wins + (won ? 1 : 0),
    };
    persist(save);
    return { status: won ? 'won' : 'lost', paused: false, save, skillMode: null };
  }),
  setSound: (sound) => set((state) => {
    const save = { ...state.save, sound };
    persist(save);
    return { save };
  }),
  resetToMenu: () => set({ status: 'menu', paused: false, skillMode: null, selectedPad: null, selectedTower: null }),
}));
