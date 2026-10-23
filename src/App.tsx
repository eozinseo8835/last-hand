import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX, X, CircleHelp, RotateCcw, Crosshair, Mouse, MoveUpRight } from 'lucide-react';
import Scene from './Scene';
import { CONFIG, handScore, type Card } from './game';
import { useGame } from './useGame';
import { tableAudio } from './audio';
import Typewriter from './Typewriter';

const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
/** Accessible equivalents of the physical cards, without exposing a hidden face. */
function CardDescription({ card, hidden = false }: { card: Card; hidden?: boolean }) {
  return <div className={hidden ? 'card-hidden' : ''} aria-label={hidden ? 'Face-down card' : `${card.rank} of ${card.suit}`}>
    <span className="card-front">{!hidden && `${card.rank} ${SUIT[card.suit]}`}</span>
  </div>;
}
function Cylinder({ chamber }: { chamber: number }) {
  return <svg viewBox="0 0 68 68" className="cylinder" role="img" aria-label={`${Math.min(chamber - 1, 6)} trigger pulls used. Current chamber ${Math.min(chamber, 6)}. Bullet position unknown.`}>
    <path d="M20 3h28l17 17v28L48 65H20L3 48V20Z" fill="#101712" stroke="#6d745c"/>
    {Array.from({ length: 6 }, (_, i) => {
      const angle = (i * 60 - 90) * Math.PI / 180, x = 34 + Math.cos(angle) * 20, y = 34 + Math.sin(angle) * 20;
      return <g key={i}><circle cx={x} cy={y} r="6.5" fill={i + 1 < chamber ? '#665d48' : '#080e0a'} stroke={i + 1 === chamber ? '#e7b06f' : '#59624c'} strokeWidth={i + 1 === chamber ? 2 : 1}/>{i + 1 < chamber && <path d={`M${x - 2} ${y - 2}l4 4m0-4l-4 4`} stroke="#c3b391"/>}</g>;
    })}<circle cx="34" cy="34" r="3" fill="#b6a078"/>
  </svg>;
}

export default function App() {
  const { game, start, fold, hit, stand, pullTrigger } = useGame();
  const [muted, setMuted] = useState(false), [rulesOpen, setRulesOpen] = useState(false);
  const [scale, setScale] = useState(1), [recenterToken, setRecenterToken] = useState(0);
  const rulesButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const intro = game.phase === 'START', over = game.phase === 'GAME_OVER';
  const ready = game.phase === 'PLAYER_DECISION';
  const playerScore = handScore(game.round?.player ?? []);
  const dealerScore = handScore(game.round?.ai ?? []);
  const danger = !intro && game.revolver.currentChamber >= CONFIG.DANGER_CHAMBER;
  useLayoutEffect(() => {
    const resize = () => setScale(Math.max(.1, Math.min((window.innerWidth - 40) / 1440, (window.innerHeight - 108) / 810, 1.5)));
    resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { if (rulesOpen) closeButton.current?.focus(); }, [rulesOpen]);
  useEffect(() => { if (game.dead) tableAudio.stopVoice(); }, [game.dead]);
  function closeRules() { setRulesOpen(false); rulesButton.current?.focus(); }
  function toggleMute() { setMuted(value => { tableAudio.mute(!value); return !value; }); }
  return <div className="app-shell">
    <header className="app-header">
      <a className="wordmark" href="./" aria-label="Last Hand home"><span className="brand-mark"><i/><i/></span>LAST HAND<span className="wordmark-version">/ 06</span></a>
      <div className="header-tagline"><span className="signal-dot"/> NO SIGNAL. NO WITNESSES.</div>
      <div className="header-actions"><button className="text-button" ref={rulesButton} onClick={() => setRulesOpen(true)}><CircleHelp size={15}/>How to play</button><span className="header-divider"/><button className="sound-button" onClick={toggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}<span>{muted ? 'MUTED' : 'SOUND ON'}</span></button></div>
    </header>
    <main className="main-frame">
      <div className="stage-viewport" style={{ width: 1440 * scale, height: 810 * scale }}>
        <section className={`stage ${intro ? 'intro-scene' : 'active-scene'} ${danger ? 'danger-stage' : ''}`} style={{ transform: `scale(${scale})` }} aria-label="Last Hand game table">
          <Scene phase={game.phase} round={game.round} roundNumber={game.roundNumber} revealed={game.revealed} suspense={game.suspense} dead={game.dead} shotEffect={game.shotEffect} danger={danger} recenterToken={recenterToken} lookDisabled={rulesOpen}/>
          <div className="scene-edge"/>
          <div className="hud-layer">
            <div className="scene-corner top-left"/><div className="scene-corner top-right"/><div className="scene-corner bottom-left"/><div className="scene-corner bottom-right"/>
            {intro ? <>
              <div className="intro-shade"/>
              <div className="scene-index"><span className="live-dot"/> SUBLEVEL 06 <span className="index-line"/> PRIVATE TABLE</div>
              <div className="intro-copy">
                <div className="eyebrow"><span/> A GAME OF NERVE</div>
                <h1>LAST<br/><span>HAND</span><i>♠</i></h1>
                <p className="intro-subtitle">A quiet room. A stranger.<br/>A hand you can’t afford to lose.</p>
                <button className="primary-button sit-button" onClick={start}><span>Sit down</span><ArrowRight size={20}/></button>
                <div className="intro-meta">SINGLE PLAYER <span>/</span> 2–5 MIN <span>/</span> NO RELOAD</div>
              </div>
              <div className="intro-room-label"><span>THE STRANGER</span><i/><small>HE’S BEEN EXPECTING YOU.</small></div>
              <div className="intro-rules"><div><span>01</span><p>Get close to 21.<br/><b>Never go over.</b></p></div><div><span>02</span><p>Lose the hand.<br/><b>Pull the trigger.</b></p></div><div><span>03</span><p>Six chambers.<br/><b>One bullet.</b></p></div></div>
            </> : <>
              <div className="game-hud hud-left"><span className="small-label">FOLDS LEFT</span><div className="fold-indicators">{Array.from({ length: 3 }, (_, i) => <span key={i} className={i < game.folds ? 'full' : ''}/>)}<b>{game.folds} / 3</b></div></div>
              <div className="round-hud"><span className="live-dot"/> AT THE TABLE <i/><b>ROUND {String(game.roundNumber).padStart(2, '0')}</b></div>
              <div className={`game-hud hud-right ${danger ? 'danger-hud' : ''}`}><div><span className="small-label">SHARED CYLINDER</span><b>CHAMBER {Math.min(game.revolver.currentChamber, 6)} <span>/ 6</span></b></div><Cylinder chamber={game.revolver.currentChamber}/></div>
              <div className="stranger-transmission"><div className="opponent-caption"><span className="small-label">THE STRANGER</span><span className="transmission-line"/><b>{game.revealed && game.round ? <>{dealerScore.soft && <small className="soft-prefix">Soft </small>}{dealerScore.total}</> : '??'}<small> POINTS</small></b></div><Typewriter text={game.dialogue} category={game.dialogueCategory} danger={game.dialogueDanger}/><span className="transmission-hint">CLICK TO SKIP TRANSMISSION</span></div>
              <div className={`result-line ${game.result ? `result-${game.result}` : ''}`} role="status">{game.message}</div>
              <div className="player-readout"><span className="small-label">YOUR HAND</span><div className="player-total" aria-label={`Your total: ${playerScore.soft ? 'Soft ' : ''}${playerScore.total}`}><b>{playerScore.soft && <small className="soft-prefix">Soft </small>}{game.round?.player.length ? playerScore.total : '—'}</b><span>YOUR TOTAL<br/><small>{playerScore.bust ? 'BUST' : 'CLOSEST TO 21 WINS'}</small></span></div></div>
              <div className="game-actions">{game.phase === 'PLAYER_SHOOTING' ? <button className="primary-button trigger-button" disabled={!game.awaitingTrigger} onClick={pullTrigger}><Crosshair size={17}/>{game.awaitingTrigger ? 'PULL THE TRIGGER' : 'HOLD YOUR BREATH…'}</button> : <><button className="secondary-button fold-button" disabled={!ready || game.hasHit || game.folds === 0} onClick={fold} title={game.hasHit ? 'Folding is only available before your first hit.' : `${game.folds} folds remaining`}><span>FOLD</span><small>{game.folds} LEFT</small></button><button className="secondary-button hit-button" disabled={!ready} onClick={hit}>HIT<span>+</span></button><button className="primary-button stand-button" disabled={!ready} onClick={stand}><span>STAND</span><ArrowRight size={20}/></button></>}</div>
              <div className="sr-only"><div className="opponent-cards">{game.round?.ai.map((card, i) => <CardDescription key={card.id} card={card} hidden={i === 1 && !game.revealed}/>)}</div><div className="player-cards">{game.round?.player.map(card => <CardDescription key={card.id} card={card}/>)}</div></div>
            </>}
            <div className="look-controls"><span><Mouse size={13}/> DRAG OR WASD TO LOOK</span><button className="recenter-button" onClick={() => setRecenterToken(token => token + 1)}><Crosshair size={14}/> Recenter</button></div>
            <div className="scene-bottom"><span>{intro ? 'LUCK HAS A LIMIT.' : danger ? 'THE ODDS ARE CLOSING IN.' : 'TRUST NOTHING. PLAY YOUR HAND.'}</span><span>ONE BULLET. NO SECOND CHANCES.<MoveUpRight size={11}/></span></div>
          </div>
          {game.shotEffect === 'shot' && <div className="muzzle-flash"/>}
          {game.dead === 'player' && <div className={`player-death-overlay ${CONFIG.GORE_LEVEL === 'low' ? 'low-gore' : ''}`}>
            {CONFIG.GORE_LEVEL !== 'low' && <svg className="blood-overlay" viewBox="0 0 1440 810"><path d="M0 0h130l-65 110 95 80-130-40L0 290zm1440 0h-165l75 95-70 155 100-65 60 110zM0 810V650l120 40 100-35-20 80 100 75zm1440 0h-280l80-120 80 30 120-130z"/><g stroke="#d0d2bb" strokeWidth="1" fill="none" opacity=".4"><path d="M930 320l-230-70-180-140M930 320l130-290M930 320l330 140 180-20M930 320l-20 160 220 330M930 320L500 670l-80 140M700 250l-60 80-180 20M1060 30l10 160 180 20M910 480l-130 70-50 260"/></g></svg>}
          </div>}
          {over && <div className="end-screen"><div className="end-content"><div className="end-emblem">{game.dead === 'ai' ? '♠' : '♣'}</div><span className="eyebrow">TRANSMISSION ENDED</span><h2>YOU<br/>{game.dead === 'ai' ? 'SURVIVED' : 'DIED'}<span>.</span></h2><p>{game.dead === 'ai' ? 'The stranger is silent. For once, so is the room.' : 'One more hand. One less chance.'}</p><div className="end-stats"><span>{game.roundNumber} HANDS DEALT</span><i/><span>{Math.min(game.revolver.currentChamber - 1, 6)} TRIGGER PULLS</span></div><button className="primary-button" onClick={start}><RotateCcw size={17}/>Play Again<ArrowRight size={18}/></button><span className="end-footnote">SAME TABLE. DIFFERENT ODDS.</span></div></div>}
        </section>
      </div>
    </main>
    <footer className="app-footer"><span>ONE TABLE. TWO STRANGERS. ONE BULLET.</span><span className="footer-tick">— — —</span><span>LAST HAND <i>/</i> A FICTIONAL GAME OF CHANCE</span></footer>
    {rulesOpen && <div className="modal-backdrop" onClick={closeRules} onKeyDown={event => { if (event.key === 'Escape') closeRules(); }}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={event => event.stopPropagation()}><button className="close-button" ref={closeButton} onClick={closeRules} aria-label="Close rules"><X size={20}/></button><div className="eyebrow">BEFORE YOU TAKE A SEAT</div><h2 id="rules-title">KNOW THE STAKES.</h2><p className="rules-lead">Luck deals the cards. You make the call.</p><ol><li><span>01</span><div><h3>READ YOUR HAND.</h3><p>Get closer to 21 than the Stranger without going over. Face cards count as 10. Aces count as 11, or 1 to keep you from busting. A soft total still counts an Ace as 11.</p></div></li><li><span>02</span><div><h3>HIT, STAND, OR FOLD.</h3><p>HIT draws another card. STAND reveals the Stranger’s hand; it draws to 17 and stands on soft 17. FOLD skips safely before your first HIT, up to three times per game.</p></div></li><li><span>03</span><div><h3>FACE THE CHAMBER.</h3><p>A bust loses the hand. Equal totals are a PUSH: nobody shoots. Otherwise, the loser pulls the trigger. Six shared chambers, one bullet, no reload.</p></div></li></ol><div className="rules-warning">His words are a bluff. His cards aren’t.</div><button className="primary-button" onClick={closeRules}>Understood<ArrowRight size={18}/></button></section></div>}
  </div>;
}
