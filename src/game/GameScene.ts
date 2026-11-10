import Phaser from 'phaser';
import { useGameStore } from './store';
import {
  ENEMIES, MAP_HEIGHT, MAP_WIDTH, PATH, PADS, TOWER_INFO,
  type EnemyType, type Pad, type Tower, type TowerType,
} from './types';

interface Enemy {
  id: number;
  type: EnemyType;
  distance: number;
  health: number;
  maxHealth: number;
  slowTime: number;
  attackFlash: number;
}

interface Projectile {
  x: number;
  y: number;
  target: Enemy;
  damage: number;
  speed: number;
  color: number;
  splash: number;
}

interface Soldier {
  x: number;
  y: number;
  life: number;
  cooldown: number;
  towerId?: number;
  index?: number;
}

interface Effect {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: number;
  radius: number;
}

const TOWER_STATS: Record<TowerType, { range: number; damage: number; cooldown: number; color: number }> = {
  archer: { range: 155, damage: 22, cooldown: 0.64, color: 0xd9e9a1 },
  mage: { range: 170, damage: 39, cooldown: 1.05, color: 0xc3a3ff },
  cannon: { range: 145, damage: 54, cooldown: 1.65, color: 0xffc56d },
  barracks: { range: 88, damage: 20, cooldown: 0.8, color: 0x9be5e9 },
};

function distanceBetween(a: Pad, b: Pad): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointOnPath(distance: number): Pad {
  let remaining = distance;
  for (let index = 0; index < PATH.length - 1; index += 1) {
    const start = PATH[index];
    const end = PATH[index + 1];
    const segmentLength = distanceBetween(start, end);
    if (remaining <= segmentLength) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= segmentLength;
  }
  return PATH[PATH.length - 1];
}

function pathLength(): number {
  return PATH.slice(1).reduce((total, point, index) => total + distanceBetween(PATH[index], point), 0);
}

const TOTAL_PATH_LENGTH = pathLength();

export class GameScene extends Phaser.Scene {
  private terrain!: Phaser.GameObjects.Graphics;
  private ink!: Phaser.GameObjects.Graphics;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private soldiers: Soldier[] = [];
  private effects: Effect[] = [];
  private padZones: Phaser.GameObjects.Zone[] = [];
  private hero = { x: 535, y: 265, targetX: 535, targetY: 265, attack: 0 };
  private spawnQueue: EnemyType[] = [];
  private spawnTimer = 0;
  private nextWaveTimer = 0;
  private enemyId = 0;
  private towerTimers = new Map<number, number>();
  private cooldownPublish = 0;
  private meteorCooldown = 0;
  private reinforcementCooldown = 0;
  private lastStatus: 'menu' | 'playing' | 'won' | 'lost' = 'menu';
  private isDisposed = false;
  private audioContext: AudioContext | null = null;
  private eventHandlers = new Map<string, EventListener>();

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.terrain = this.add.graphics();
    this.ink = this.add.graphics();
    this.drawTerrain();
    this.createPadZones();
    this.input.on('pointerdown', this.handleMapClick, this);
    this.listen('game:new-run', () => {
      this.resetRunState();
      this.lastStatus = 'playing';
    });
    this.listen('game:start-wave', () => this.beginNextWave());
    this.listen('game:meteor', (event) => {
      const { x, y } = (event as CustomEvent<Pad>).detail;
      this.castMeteor(x, y);
    });
    this.listen('game:reinforcements', () => this.callReinforcements());
    this.listen('game:dispose', () => this.dispose());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  dispose(): void {
    this.isDisposed = true;
    this.cleanup();
  }

  update(_time: number, deltaMs: number): void {
    if (this.isDisposed) return;
    const state = useGameStore.getState();
    if (state.status !== this.lastStatus && state.status === 'playing') this.resetRunState();
    this.lastStatus = state.status;
    if (state.status !== 'playing' || state.paused) return;
    const delta = Math.min(deltaMs / 1000, 0.05) * state.speed;

    this.advanceCooldowns(delta);
    this.moveHero(delta);
    this.spawnTimer -= delta;
    if (this.spawnQueue.length > 0 && this.spawnTimer <= 0) this.spawnEnemy();

    for (const enemy of this.enemies) {
      const definition = ENEMIES[enemy.type];
      const speed = enemy.slowTime > 0 ? definition.speed * 0.55 : definition.speed;
      enemy.distance += speed * delta;
      enemy.slowTime = Math.max(0, enemy.slowTime - delta);
      enemy.attackFlash = Math.max(0, enemy.attackFlash - delta);
    }

    this.attackWithTowers(delta);
    this.attackWithHero(delta);
    this.advanceProjectiles(delta);
    this.advanceSoldiers(delta);
    this.removeDefeatedAndEscaped();
    this.advanceEffects(delta);
    this.publishState();
    this.drawWorld();

    if (this.spawnQueue.length === 0 && this.enemies.length === 0) this.handleWaveClear(delta);
    else this.nextWaveTimer = 0;
  }

  private resetRunState(): void {
    this.enemies = [];
    this.projectiles = [];
    this.soldiers = [];
    this.effects = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.nextWaveTimer = 0;
    this.towerTimers.clear();
    this.cooldownPublish = 0;
    this.meteorCooldown = 0;
    this.reinforcementCooldown = 0;
    this.hero = { x: 535, y: 265, targetX: 535, targetY: 265, attack: 0 };
  }

  private listen(name: string, handler: EventListener): void {
    window.addEventListener(name, handler);
    this.eventHandlers.set(name, handler);
  }

  private cleanup(): void {
    for (const [name, handler] of this.eventHandlers) window.removeEventListener(name, handler);
    this.eventHandlers.clear();
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.fillGradientStyle(0x1c342d, 0x1c342d, 0x2d4934, 0x263e31, 1);
    g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    g.fillStyle(0x213a31, 0.65);
    for (let i = 0; i < 34; i += 1) {
      const x = (i * 173 + 41) % MAP_WIDTH;
      const y = (i * 257 + 27) % MAP_HEIGHT;
      if (this.nearPath(x, y, 55)) continue;
      g.fillCircle(x, y, 16 + (i % 4) * 5);
      g.fillStyle(0x304c38, 0.8);
      g.fillCircle(x - 5, y - 5, 10 + (i % 3) * 3);
      g.fillStyle(0x213a31, 0.65);
      g.fillRect(x - 2, y + 9, 4, 12);
    }
    g.lineStyle(44, 0x172b27, 0.55);
    g.beginPath();
    g.moveTo(PATH[0].x, PATH[0].y);
    for (const point of PATH.slice(1)) g.lineTo(point.x, point.y);
    g.strokePath();
    g.lineStyle(36, 0x866c4d, 1);
    g.beginPath();
    g.moveTo(PATH[0].x, PATH[0].y);
    for (const point of PATH.slice(1)) g.lineTo(point.x, point.y);
    g.strokePath();
    g.lineStyle(25, 0xb29160, 1);
    g.beginPath();
    g.moveTo(PATH[0].x, PATH[0].y);
    for (const point of PATH.slice(1)) g.lineTo(point.x, point.y);
    g.strokePath();
    g.lineStyle(2, 0xd8bc80, 0.38);
    g.beginPath();
    g.moveTo(PATH[0].x, PATH[0].y - 4);
    for (const point of PATH.slice(1)) g.lineTo(point.x, point.y - 4);
    g.strokePath();

    for (let i = 0; i < 12; i += 1) {
      const x = 26 + (i * 83) % 950;
      const y = 35 + (i * 137) % 520;
      if (!this.nearPath(x, y, 43)) {
        g.fillStyle(i % 2 ? 0x557252 : 0x927c54, 0.8);
        g.fillEllipse(x, y, 5, 3);
      }
    }
    this.drawCastle(g);
    g.fillStyle(0xe4c88a, 0.8);
    g.fillRoundedRect(28, 93, 92, 23, 8);
    this.add.text(74, 104, '森林小徑', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#493b2d', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    g.fillStyle(0x172b27, 0.52);
    g.fillCircle(535, 265, 26);
    g.fillStyle(0x9fba79, 0.15);
    g.fillCircle(535, 265, 34);
  }

  private drawCastle(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x172823, 0.55);
    g.fillEllipse(957, 385, 110, 75);
    g.fillStyle(0xc8bea3, 1);
    g.fillRect(925, 319, 70, 71);
    g.fillRect(916, 301, 18, 89);
    g.fillRect(985, 301, 18, 89);
    g.fillStyle(0x9b8161, 1);
    g.fillTriangle(916, 302, 925, 278, 934, 302);
    g.fillTriangle(985, 302, 994, 278, 1003, 302);
    g.fillStyle(0x5e493d, 1);
    g.fillRect(951, 350, 19, 40);
    g.fillStyle(0x46654a, 1);
    g.fillRect(956, 293, 3, 45);
    g.fillTriangle(959, 293, 981, 299, 959, 306);
  }

  private nearPath(x: number, y: number, threshold: number): boolean {
    return PATH.some((point) => distanceBetween({ x, y }, point) < threshold);
  }

  private createPadZones(): void {
    PADS.forEach((pad, index) => {
      const zone = this.add.zone(pad.x, pad.y, 52, 52).setInteractive();
      zone.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Event) => {
        event.stopPropagation();
        const tower = useGameStore.getState().towers.find((item) => item.pad === index);
        if (tower) useGameStore.getState().selectTower(tower.id);
        else useGameStore.getState().selectPad(index);
      });
      this.padZones.push(zone);
    });
  }

  private handleMapClick(pointer: Phaser.Input.Pointer): void {
    const state = useGameStore.getState();
    if (state.status !== 'playing' || state.paused) return;
    if (state.skillMode === 'meteor') {
      state.useMeteor(pointer.worldX, pointer.worldY);
      return;
    }
    this.hero.targetX = Phaser.Math.Clamp(pointer.worldX, 22, MAP_WIDTH - 22);
    this.hero.targetY = Phaser.Math.Clamp(pointer.worldY, 34, MAP_HEIGHT - 30);
  }

  private beginNextWave(): void {
    if (this.lastStatus !== 'playing') {
      this.resetRunState();
      this.lastStatus = 'playing';
    }
    const state = useGameStore.getState();
    if (state.status !== 'playing' || !state.waveReady) return;
    const wave = state.wave + 1;
    const count = 5 + Math.floor(wave * 1.15);
    const queue: EnemyType[] = [];
    for (let i = 0; i < count; i += 1) queue.push(this.pickEnemy(wave, i));
    if (wave === 20) queue.push('boss');
    this.spawnQueue = queue;
    this.spawnTimer = 0.2;
    this.nextWaveTimer = 0;
    useGameStore.getState().setWave(wave, queue.length);
    this.playTone(430, 0.12);
  }

  private pickEnemy(wave: number, index: number): EnemyType {
    if (wave >= 12 && index % 5 === 3) return 'demon';
    if (wave >= 8 && index % 4 === 2) return 'knight';
    if (wave >= 5 && index % 3 === 1) return 'wolf';
    if (wave >= 3 && index % 3 === 2) return 'orc';
    return 'goblin';
  }

  private spawnEnemy(): void {
    const type = this.spawnQueue.shift();
    if (!type) return;
    const scale = 1 + useGameStore.getState().wave * 0.13;
    const baseHealth = ENEMIES[type].health * scale;
    this.enemies.push({
      id: this.enemyId++,
      type,
      distance: 0,
      health: baseHealth,
      maxHealth: baseHealth,
      slowTime: 0,
      attackFlash: 0,
    });
    this.spawnTimer = type === 'boss' ? 1.6 : 0.82;
    useGameStore.getState().setRemaining(this.spawnQueue.length + this.enemies.length);
  }

  private advanceCooldowns(delta: number): void {
    this.meteorCooldown = Math.max(0, this.meteorCooldown - delta);
    this.reinforcementCooldown = Math.max(0, this.reinforcementCooldown - delta);
    this.cooldownPublish += delta;
    if (this.cooldownPublish >= 0.15) {
      this.cooldownPublish = 0;
      useGameStore.getState().setCooldowns(this.meteorCooldown, this.reinforcementCooldown);
    }
  }

  private moveHero(delta: number): void {
    const dx = this.hero.targetX - this.hero.x;
    const dy = this.hero.targetY - this.hero.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2) {
      const step = Math.min(distance, 155 * delta);
      this.hero.x += (dx / distance) * step;
      this.hero.y += (dy / distance) * step;
    }
  }

  private attackWithTowers(delta: number): void {
    const towers = useGameStore.getState().towers;
    for (const tower of towers) {
      const base = TOWER_STATS[tower.type];
      const scale = 1 + (tower.level - 1) * 0.48;
      const range = base.range * (1 + (tower.level - 1) * 0.1);
      const pad = PADS[tower.pad];
      if (tower.type === 'barracks') {
        this.fightBarracks(tower, pad, base, scale, range, delta);
        continue;
      }
      const timer = Math.max(0, (this.towerTimers.get(tower.id) ?? 0) - delta);
      this.towerTimers.set(tower.id, timer);
      if (timer > 0) continue;
      const target = this.enemies
        .filter((enemy) => enemy.health > 0)
        .map((enemy) => ({ enemy, point: pointOnPath(enemy.distance) }))
        .filter(({ point }) => distanceBetween(pad, point) <= range)
        .sort((a, b) => b.enemy.distance - a.enemy.distance)[0]?.enemy;
      if (!target) continue;
      this.towerTimers.set(tower.id, base.cooldown * Math.max(0.62, 1 - (tower.level - 1) * 0.1));
      this.projectiles.push({
        x: pad.x, y: pad.y - 13, target,
        damage: base.damage * scale,
        speed: tower.type === 'mage' ? 430 : tower.type === 'cannon' ? 300 : 500,
        color: base.color, splash: tower.type === 'cannon' ? 48 + tower.level * 6 : 0,
      });
      if (tower.type === 'mage') target.slowTime = Math.max(target.slowTime, 0.45);
    }
  }

  private fightBarracks(tower: Tower, pad: Pad, base: typeof TOWER_STATS[TowerType], scale: number, range: number, delta: number): void {
    const spots = [{ x: pad.x - 26, y: pad.y + 22 }, { x: pad.x + 26, y: pad.y + 22 }];
    spots.forEach((spot, index) => {
      let soldier = this.soldiers.find((unit) => unit.towerId === tower.id && unit.index === index);
      if (!soldier) {
        soldier = { ...spot, life: 0, cooldown: 0, towerId: tower.id, index };
        this.soldiers.push(soldier);
      }
      soldier.x += (spot.x - soldier.x) * Math.min(1, delta * 5);
      soldier.y += (spot.y - soldier.y) * Math.min(1, delta * 5);
      const target = this.enemies
        .filter((enemy) => enemy.health > 0)
        .map((enemy) => ({ enemy, point: pointOnPath(enemy.distance) }))
        .filter(({ point }) => distanceBetween(soldier!, point) < range)
        .sort((a, b) => b.enemy.distance - a.enemy.distance)[0]?.enemy;
      soldier.cooldown = Math.max(0, soldier.cooldown - delta);
      if (target && soldier.cooldown <= 0) {
        target.health -= base.damage * scale;
        target.attackFlash = 0.12;
        soldier.cooldown = base.cooldown;
        this.effects.push({ x: soldier.x, y: soldier.y, life: 0.15, maxLife: 0.15, color: base.color, radius: 12 });
      }
    });
  }

  private attackWithHero(delta: number): void {
    this.hero.attack = Math.max(0, this.hero.attack - delta);
    if (this.hero.attack > 0) return;
    const target = this.enemies
      .filter((enemy) => enemy.health > 0)
      .map((enemy) => ({ enemy, point: pointOnPath(enemy.distance) }))
      .filter(({ point }) => distanceBetween(this.hero, point) < 46)
      .sort((a, b) => b.enemy.distance - a.enemy.distance)[0]?.enemy;
    if (!target) return;
    target.health -= 34;
    target.attackFlash = 0.18;
    this.hero.attack = 0.62;
    this.effects.push({ x: this.hero.x, y: this.hero.y - 14, life: 0.2, maxLife: 0.2, color: 0xffe6a3, radius: 23 });
  }

  private advanceProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (projectile.target.health <= 0) {
        this.projectiles.splice(index, 1);
        continue;
      }
      const point = pointOnPath(projectile.target.distance);
      const dx = point.x - projectile.x;
      const dy = point.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const step = projectile.speed * delta;
      if (distance <= step + 7) {
        projectile.target.health -= projectile.damage;
        projectile.target.attackFlash = 0.14;
        if (projectile.splash > 0) {
          for (const enemy of this.enemies) {
            if (enemy !== projectile.target && enemy.health > 0 && distanceBetween(pointOnPath(enemy.distance), point) < projectile.splash) {
              enemy.health -= projectile.damage * 0.55;
            }
          }
          this.effects.push({ x: point.x, y: point.y, life: 0.3, maxLife: 0.3, color: projectile.color, radius: projectile.splash });
        }
        this.projectiles.splice(index, 1);
      } else {
        projectile.x += (dx / distance) * step;
        projectile.y += (dy / distance) * step;
      }
    }
  }

  private advanceSoldiers(delta: number): void {
    for (const soldier of this.soldiers) {
      if (soldier.towerId !== -1) continue;
      soldier.life -= delta;
      soldier.cooldown = Math.max(0, soldier.cooldown - delta);
      if (soldier.life <= 0 || soldier.cooldown > 0) continue;
      const target = this.enemies
        .filter((enemy) => enemy.health > 0)
        .map((enemy) => ({ enemy, point: pointOnPath(enemy.distance) }))
        .filter(({ point }) => distanceBetween(soldier, point) < 58)
        .sort((a, b) => b.enemy.distance - a.enemy.distance)[0]?.enemy;
      if (target) {
        target.health -= 30;
        target.attackFlash = 0.15;
        soldier.cooldown = 0.85;
      }
    }
    this.soldiers = this.soldiers.filter((soldier) => soldier.towerId === -1
      ? soldier.life > 0
      : useGameStore.getState().towers.some((tower) => tower.id === soldier.towerId));
  }

  private removeDefeatedAndEscaped(): void {
    const state = useGameStore.getState();
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) {
        useGameStore.getState().addGold(ENEMIES[enemy.type].reward);
        const point = pointOnPath(enemy.distance);
        this.effects.push({ x: point.x, y: point.y, life: 0.34, maxLife: 0.34, color: ENEMIES[enemy.type].color, radius: ENEMIES[enemy.type].size * 2.4 });
      } else if (enemy.distance >= TOTAL_PATH_LENGTH) {
        useGameStore.getState().loseLife(enemy.type === 'boss' ? 5 : enemy.type === 'knight' ? 2 : 1);
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.health > 0 && enemy.distance < TOTAL_PATH_LENGTH);
    if (state.status !== useGameStore.getState().status && useGameStore.getState().status === 'lost') {
      useGameStore.getState().finishGame(false);
    }
  }

  private advanceEffects(delta: number): void {
    this.effects = this.effects.filter((effect) => {
      effect.life -= delta;
      return effect.life > 0;
    });
  }

  private publishState(): void {
    useGameStore.getState().setRemaining(this.spawnQueue.length + this.enemies.length);
  }

  private handleWaveClear(delta: number): void {
    const state = useGameStore.getState();
    if (state.wave <= 0) return;
    if (state.wave >= 20) {
      useGameStore.getState().finishGame(true);
      this.playTone(660, 0.3);
      return;
    }
    if (!state.waveReady) useGameStore.getState().setWaveReady(true);
    this.nextWaveTimer += delta;
    if (this.nextWaveTimer >= 8) {
      this.nextWaveTimer = 0;
      this.beginNextWave();
    }
  }

  private castMeteor(x: number, y: number): void {
    const center = { x, y };
    const radius = 105;
    for (const enemy of this.enemies) {
      const point = pointOnPath(enemy.distance);
      if (distanceBetween(point, center) <= radius) {
        enemy.health -= 185;
        enemy.attackFlash = 0.3;
      }
    }
    this.effects.push({ x: center.x, y: center.y, life: 0.75, maxLife: 0.75, color: 0xff9a5c, radius });
    this.meteorCooldown = 45;
    this.playTone(180, 0.35);
  }

  private callReinforcements(): void {
    for (const offset of [-20, 20]) {
      this.soldiers.push({
        x: this.hero.x + offset, y: this.hero.y + 12, life: 12, cooldown: 0,
        towerId: -1, index: offset,
      });
    }
    this.reinforcementCooldown = 30;
    this.effects.push({ x: this.hero.x, y: this.hero.y, life: 0.5, maxLife: 0.5, color: 0x9be5e9, radius: 48 });
    this.playTone(520, 0.18);
  }

  private playTone(frequency: number, duration: number): void {
    if (!useGameStore.getState().save.sound) return;
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === 'suspended') void this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.055, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (error) {
      console.warn('無法播放遊戲音效：', error);
    }
  }

  private drawWorld(): void {
    const g = this.ink;
    g.clear();
    const state = useGameStore.getState();

    PADS.forEach((pad, index) => {
      const tower = state.towers.find((item) => item.pad === index);
      if (tower) {
        const info = TOWER_INFO[tower.type];
        const selected = tower.id === state.selectedTower;
        const range = TOWER_STATS[tower.type].range * (1 + (tower.level - 1) * 0.1);
        if (selected) {
          g.fillStyle(info.color, 0.09);
          g.fillCircle(pad.x, pad.y, range);
          g.lineStyle(2, info.color, 0.6);
          g.strokeCircle(pad.x, pad.y, range);
        }
        this.drawTower(g, pad, tower, selected);
      } else {
        const selected = index === state.selectedPad;
        g.fillStyle(selected ? 0xe9d691 : 0xd7c18a, selected ? 0.36 : 0.2);
        g.fillCircle(pad.x, pad.y, selected ? 20 : 16);
        g.lineStyle(2, selected ? 0xffe4a0 : 0xead8a8, selected ? 0.95 : 0.55);
        g.strokeCircle(pad.x, pad.y, selected ? 20 : 16);
        g.fillStyle(0xfff0c5, 0.8);
        g.fillCircle(pad.x, pad.y, 3);
      }
    });

    for (const soldier of this.soldiers) this.drawPerson(g, soldier.x, soldier.y, 0x70c7ce, 7, false);
    for (const enemy of this.enemies) {
      const point = pointOnPath(enemy.distance);
      this.drawEnemy(g, enemy, point);
    }
    for (const projectile of this.projectiles) {
      g.fillStyle(projectile.color, 0.22);
      g.fillCircle(projectile.x, projectile.y, 8);
      g.fillStyle(projectile.color, 1);
      g.fillCircle(projectile.x, projectile.y, 4);
    }
    for (const effect of this.effects) {
      const progress = 1 - effect.life / effect.maxLife;
      const radius = effect.radius * (0.25 + progress * 0.75);
      g.fillStyle(effect.color, 0.12 * (1 - progress));
      g.fillCircle(effect.x, effect.y, radius);
      g.lineStyle(effect.radius > 50 ? 5 : 2, effect.color, 0.75 * (1 - progress));
      g.strokeCircle(effect.x, effect.y, radius);
    }
    this.drawHero(g);
  }

  private drawTower(g: Phaser.GameObjects.Graphics, pad: Pad, tower: Tower, selected: boolean): void {
    const info = TOWER_INFO[tower.type];
    g.fillStyle(0x152621, 0.55);
    g.fillEllipse(pad.x, pad.y + 14, 48, 19);
    g.fillStyle(0x6a5139, 1);
    g.fillCircle(pad.x, pad.y, 21);
    g.fillStyle(info.color, 1);
    if (tower.type === 'archer') {
      g.fillRect(pad.x - 13, pad.y - 16, 26, 29);
      g.fillTriangle(pad.x - 18, pad.y - 15, pad.x, pad.y - 32, pad.x + 18, pad.y - 15);
      g.fillStyle(0xe5d6a5, 1);
      g.fillRect(pad.x - 2, pad.y - 23, 4, 22);
      g.lineStyle(2, 0xf2dfa8, 1);
      g.beginPath();
      g.moveTo(pad.x + 9, pad.y - 22);
      g.lineTo(pad.x + 17, pad.y - 5);
      g.strokePath();
    } else if (tower.type === 'mage') {
      g.fillTriangle(pad.x - 17, pad.y + 13, pad.x + 17, pad.y + 13, pad.x, pad.y - 26);
      g.fillStyle(0xd0b7ff, 1);
      g.fillCircle(pad.x, pad.y - 25, 8);
      g.fillStyle(0x664a99, 1);
      g.fillTriangle(pad.x - 11, pad.y - 8, pad.x + 11, pad.y - 8, pad.x, pad.y - 22);
    } else if (tower.type === 'cannon') {
      g.fillCircle(pad.x, pad.y - 3, 17);
      g.fillStyle(0x4a4741, 1);
      g.fillRect(pad.x - 5, pad.y - 26, 10, 28);
      g.fillStyle(0xf4c26d, 1);
      g.fillCircle(pad.x, pad.y - 4, 7);
    } else {
      g.fillRect(pad.x - 16, pad.y - 17, 32, 29);
      g.fillStyle(0xead9b5, 1);
      g.fillTriangle(pad.x - 20, pad.y - 17, pad.x, pad.y - 32, pad.x + 20, pad.y - 17);
      g.fillStyle(0x69b7c8, 1);
      g.fillRect(pad.x - 4, pad.y - 8, 8, 20);
    }
    if (tower.level > 1) {
      g.fillStyle(0xffe69b, 1);
      for (let i = 0; i < tower.level - 1; i += 1) g.fillCircle(pad.x - 6 + i * 12, pad.y + 18, 3);
    }
    if (selected) {
      g.lineStyle(2, 0xffe7a0, 1);
      g.strokeCircle(pad.x, pad.y, 25);
    }
  }

  private drawEnemy(g: Phaser.GameObjects.Graphics, enemy: Enemy, point: Pad): void {
    const definition = ENEMIES[enemy.type];
    const size = definition.size;
    const y = point.y + Math.sin(enemy.distance / 10) * 2;
    if (enemy.type === 'demon') {
      g.fillStyle(definition.color, 0.9);
      g.fillTriangle(point.x - size, y - 3, point.x - size - 12, y - 13, point.x - size + 2, y + 5);
      g.fillTriangle(point.x + size, y - 3, point.x + size + 12, y - 13, point.x + size - 2, y + 5);
    }
    g.fillStyle(enemy.attackFlash > 0 ? 0xffffff : definition.color, 1);
    g.fillCircle(point.x, y, size);
    g.fillStyle(0x302a2b, 1);
    g.fillCircle(point.x - size * 0.3, y - 2, 2);
    g.fillCircle(point.x + size * 0.3, y - 2, 2);
    if (enemy.type === 'orc' || enemy.type === 'boss') {
      g.fillStyle(0xe6d7b4, 1);
      g.fillTriangle(point.x - 8, y + 5, point.x - 5, y + 13, point.x - 2, y + 5);
      g.fillTriangle(point.x + 2, y + 5, point.x + 5, y + 13, point.x + 8, y + 5);
    }
    const barWidth = size * 2.7;
    g.fillStyle(0x281e21, 0.9);
    g.fillRoundedRect(point.x - barWidth / 2, y - size - 9, barWidth, 4, 2);
    g.fillStyle(enemy.type === 'boss' ? 0xf16a63 : 0x94d47b, 1);
    g.fillRoundedRect(point.x - barWidth / 2, y - size - 9, barWidth * Math.max(0, enemy.health / enemy.maxHealth), 4, 2);
    if (enemy.type === 'boss') {
      g.fillStyle(0xf0c678, 1);
      g.fillTriangle(point.x - 13, y - size - 3, point.x - 9, y - size - 15, point.x - 5, y - size - 3);
      g.fillTriangle(point.x + 5, y - size - 3, point.x + 9, y - size - 15, point.x + 13, y - size - 3);
    }
  }

  private drawPerson(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, size: number, hero: boolean): void {
    g.fillStyle(0x17231f, 0.55);
    g.fillEllipse(x, y + size, size * 2.5, size * 0.8);
    g.fillStyle(color, 1);
    g.fillCircle(x, y - size * 0.35, size * 0.72);
    g.fillCircle(x, y + size * 0.55, size * 0.82);
    g.fillStyle(hero ? 0xf4d5b3 : 0x263b42, 1);
    g.fillCircle(x, y - size * 0.5, size * 0.48);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + size * 0.15, y - size * 0.55, 1.5);
    if (hero) {
      g.fillStyle(0xf2c66d, 1);
      g.fillRect(x + size * 0.58, y - size * 0.6, 3, size * 1.8);
    }
  }

  private drawHero(g: Phaser.GameObjects.Graphics): void {
    const time = this.time.now / 170;
    this.drawPerson(g, this.hero.x, this.hero.y + Math.sin(time) * 1.5, 0x4ca7a1, 13, true);
    g.fillStyle(0xf5d36f, 0.9);
    g.fillCircle(this.hero.x, this.hero.y - 25, 2.4);
    if (useGameStore.getState().skillMode === 'meteor') {
      g.lineStyle(2, 0xffb875, 0.7);
      g.strokeCircle(this.input.activePointer.worldX, this.input.activePointer.worldY, 105);
    }
  }
}
