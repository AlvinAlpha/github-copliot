import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../game/GameScene';
import { useGameStore } from '../game/store';
import { TOWER_COST, TOWER_INFO, type TowerType } from '../game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'mage', 'cannon', 'barracks'];

function App(): JSX.Element {
  const gameHost = useRef<HTMLDivElement>(null);
  const state = useGameStore();
  const selectedTower = state.towers.find((tower) => tower.id === state.selectedTower);
  const selectedPadOccupied = state.selectedPad !== null && state.towers.some((tower) => tower.pad === state.selectedPad);

  useEffect(() => {
    if (!gameHost.current) return undefined;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameHost.current,
      width: 1000,
      height: 600,
      backgroundColor: '#1c342d',
      render: { antialias: true, pixelArt: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [GameScene],
    });
    return () => {
      window.dispatchEvent(new Event('game:dispose'));
      game.destroy(true);
    };
  }, []);

  const toggleSound = (): void => state.setSound(!state.save.sound);
  const start = (): void => state.startGame();
  const formatCooldown = (seconds: number): string => seconds > 0 ? `${Math.ceil(seconds)}s` : '就緒';

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="王國守衛者首頁">
          <span className="brand-mark">♜</span>
          <span><strong>王國守衛者</strong><small>KINGDOM DEFENDER</small></span>
        </a>
        <div className="topbar-right">
          <span className="chapter-tag"><span className="live-dot" /> 翡翠森林・第一章</span>
          <button className="sound-button" onClick={toggleSound} aria-label={state.save.sound ? '關閉音效' : '開啟音效'}>
            {state.save.sound ? '♪ 音效開啟' : '♫ 音效關閉'}
          </button>
        </div>
      </header>

      <section className="game-layout" aria-label="塔防遊戲">
        <div className="hud">
          <div className="hud-stat health-stat">
            <span className="stat-icon">♥</span><span className="stat-label">城堡生命</span>
            <strong>{state.lives}<small> / 20</small></strong>
            <div className="health-track"><span style={{ width: `${state.lives * 5}%` }} /></div>
          </div>
          <div className="hud-stat">
            <span className="stat-icon gold-icon">◈</span><span className="stat-label">王國金幣</span>
            <strong>{state.gold}</strong>
          </div>
          <div className="hud-stat wave-stat">
            <span className="stat-icon wave-icon">⚑</span><span className="stat-label">敵軍波次</span>
            <strong>{state.wave}<small> / 20</small></strong>
          </div>
          <div className="hud-stat enemy-stat">
            <span className="stat-icon enemy-icon">◆</span><span className="stat-label">戰場敵人</span>
            <strong>{state.enemiesRemaining}</strong>
          </div>
          {state.status === 'playing' && (
            <div className="hud-actions">
              <button className={`control-button ${state.paused ? 'is-paused' : ''}`} onClick={state.togglePause}>
                {state.paused ? '▶ 繼續' : 'Ⅱ 暫停'}
              </button>
              <button className="control-button speed-button" onClick={state.toggleSpeed}>{state.speed}× 速度</button>
            </div>
          )}
        </div>

        <div className="stage-wrap">
          <div className="stage-frame">
            <div className="game-canvas" ref={gameHost} />
            {state.status === 'playing' && state.skillMode === 'meteor' && (
              <div className="skill-hint">點擊戰場選擇流星火雨落點</div>
            )}
            {state.status === 'playing' && state.paused && (
              <div className="pause-overlay"><span>Ⅱ</span><strong>戰局暫停中</strong><small>休息一下，再繼續守護王國</small></div>
            )}
            {(state.status === 'menu' || state.status === 'won' || state.status === 'lost') && (
              <div className="modal-backdrop">
                {state.status === 'menu' ? (
                  <section className="intro-card">
                    <div className="crest">♜</div>
                    <p className="eyebrow">THE REALM NEEDS YOU</p>
                    <h1>王國守衛者</h1>
                    <p className="intro-copy">古老森林的魔物正朝城堡逼近。<br />建造防線，率領英雄，守住最後一道城門。</p>
                    <div className="intro-stats">
                      <span><b>20</b><small>波敵軍</small></span>
                      <span><b>4</b><small>種防禦塔</small></span>
                      <span><b>{state.save.bestWave}</b><small>最佳波次</small></span>
                    </div>
                    <button className="primary-button" onClick={start}>開始守衛 <span>→</span></button>
                    <small className="hint-text">點擊空地建塔・點擊戰場移動英雄</small>
                  </section>
                ) : (
                  <section className="result-card">
                    <div className={`result-emblem ${state.status}`}>{state.status === 'won' ? '✦' : '⚔'}</div>
                    <p className="eyebrow">{state.status === 'won' ? 'THE REALM IS SAFE' : 'THE CASTLE HAS FALLEN'}</p>
                    <h2>{state.status === 'won' ? '王國得救了！' : '城堡失守'}</h2>
                    <p>{state.status === 'won' ? '英雄與守衛者的傳奇，將永遠流傳。' : `你成功守住了 ${state.wave} 波敵軍。整軍再戰吧！`}</p>
                    <button className="primary-button" onClick={start}>再次出征 <span>→</span></button>
                    <button className="text-button" onClick={state.resetToMenu}>返回主選單</button>
                  </section>
                )}
              </div>
            )}
          </div>
          <div className="stage-caption">
            <span><i className="legend-dot route-dot" /> 敵軍路線</span>
            <span><i className="legend-dot build-dot" /> 固定建塔位置</span>
            <span className="captain-note">✦ 點擊地面移動英雄</span>
          </div>
        </div>

        <section className="command-bar">
          <div className="command-main">
            <div className="command-heading">
              <div><p className="panel-kicker">COMMAND</p><h2>{selectedTower ? '防禦塔管理' : '王國指揮'}</h2></div>
              {state.status === 'playing' && state.waveReady && (
                <button className="wave-button" onClick={state.startWave}>
                  {state.wave === 0 ? '召喚第一波' : '提前召喚'} <span>→</span>
                </button>
              )}
              {state.status === 'playing' && !state.waveReady && (
                <span className="incoming-label"><i className="live-dot" /> {state.enemiesRemaining ? '敵軍來襲' : '清理戰場中'}</span>
              )}
            </div>

            {selectedTower ? (
              <div className="tower-management">
                <div className="tower-summary">
                  <span className="tower-glyph" style={{ color: `#${TOWER_INFO[selectedTower.type].color.toString(16)}` }}>
                    {TOWER_INFO[selectedTower.type].icon}
                  </span>
                  <div><strong>{TOWER_INFO[selectedTower.type].name}</strong><small>等級 {selectedTower.level} ・ 攻擊範圍顯示中</small></div>
                </div>
                <div className="tower-buttons">
                  {selectedTower.level < 3 && (
                    <button
                      className="upgrade-button"
                      onClick={state.upgradeTower}
                      disabled={state.gold < Math.round(TOWER_COST[selectedTower.type] * (selectedTower.level === 1 ? 0.8 : 1.2))}
                    >
                      升級 Lv.{selectedTower.level + 1}
                      <small>◈ {Math.round(TOWER_COST[selectedTower.type] * (selectedTower.level === 1 ? 0.8 : 1.2))}</small>
                    </button>
                  )}
                  <button className="sell-button" onClick={state.sellTower}>出售 <small>+◈ {Math.floor(selectedTower.spent * 0.6)}</small></button>
                </div>
              </div>
            ) : state.selectedPad !== null && !selectedPadOccupied ? (
              <div className="build-options">
                {TOWER_ORDER.map((type) => {
                  const info = TOWER_INFO[type];
                  const affordable = state.gold >= TOWER_COST[type];
                  return (
                    <button
                      className={`tower-card ${!affordable ? 'unaffordable' : ''}`}
                      key={type}
                      onClick={() => state.buildTower(type)}
                      disabled={!affordable || state.status !== 'playing'}
                    >
                      <span className="tower-glyph" style={{ color: `#${info.color.toString(16)}` }}>{info.icon}</span>
                      <span className="tower-card-copy"><strong>{info.name}</strong><small>{info.description}</small></span>
                      <span className="tower-cost">◈ {TOWER_COST[type]}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ready-panel">
                <div className="ready-icon">♙</div>
                <p>點擊地圖上的 <b>空白圓點</b> 建造防禦塔，<br />或點擊戰場移動英雄至危險區域。</p>
              </div>
            )}
          </div>

          <aside className="skills-panel">
            <div className="skills-heading"><div><p className="panel-kicker">HERO SKILLS</p><h2>英雄技能</h2></div><span className="hero-level">LV. 1</span></div>
            <div className="skill-list">
              <button
                className={`skill-button meteor-skill ${state.skillMode ? 'skill-selected' : ''}`}
                onClick={state.activateMeteor}
                disabled={state.status !== 'playing' || state.meteorCooldown > 0 || state.skillMode !== null}
              >
                <span className="skill-icon">☄</span>
                <span className="skill-copy"><strong>流星火雨</strong><small>{state.skillMode ? '點擊地圖施放' : '範圍重擊・105 射程'}</small></span>
                <span className="cooldown">{state.meteorCooldown > 0 ? formatCooldown(state.meteorCooldown) : 'Q'}</span>
              </button>
              <button
                className="skill-button troop-skill"
                onClick={state.activateReinforcements}
                disabled={state.status !== 'playing' || state.reinforcementsCooldown > 0}
              >
                <span className="skill-icon">⚔</span>
                <span className="skill-copy"><strong>召喚援軍</strong><small>英雄附近加入戰鬥</small></span>
                <span className="cooldown">{state.reinforcementsCooldown > 0 ? formatCooldown(state.reinforcementsCooldown) : 'W'}</span>
              </button>
            </div>
          </aside>
        </section>
        <footer className="game-footer"><span>✦ 守住森林，守護王國 ✦</span><span>進度自動儲存於此裝置</span></footer>
      </section>
    </main>
  );
}

export default App;
