import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX, X, ArrowUpRight, CircleHelp, RotateCcw, Shield, Crosshair } from 'lucide-react';
import Scene, { Revolver } from './Scene';
import { CONFIG, handTotal } from './game';
import type { Card } from './game';
import { useGame } from './useGame';
import { tableAudio } from './audio';

const SUIT = { spades:'♠', hearts:'♥', diamonds:'♦', clubs:'♣' };
function PlayingCard({ card, hidden = false, index = 0 }: { card: Card; hidden?: boolean; index?: number }) {
 return <div className={`playing-card ${hidden ? 'card-hidden' : ''} ${!hidden && (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red-card' : ''}`} style={{'--card-index':index} as React.CSSProperties} aria-label={hidden ? 'Face-down card' : `${card.rank} of ${card.suit}`}>
  <div className="card-flipper">
   <div className="card-front">{!hidden && <>
    <div className="card-corner"><b>{card.rank}</b><span>{SUIT[card.suit]}</span></div>
    <div className="card-center"><span>{SUIT[card.suit]}</span>{['J','Q','K'].includes(card.rank) && <small>{card.rank === 'K' ? 'KING' : card.rank === 'Q' ? 'QUEEN' : 'JACK'}</small>}</div>
    <div className="card-corner inverted"><b>{card.rank}</b><span>{SUIT[card.suit]}</span></div>
   </>}</div>
   <div className="card-back-face"><div className="card-back"><div className="card-back-inner"><span>LH</span><i>✦</i></div></div></div>
  </div>
 </div>;
}
function Typewriter({ text }: { text:string }) {
 const [count, setCount] = useState(0);
 useEffect(() => { setCount(0); const timer = setInterval(() => setCount(n => n >= text.length ? n : n + 1), 30); return () => clearInterval(timer); }, [text]);
 return <button className="dialogue" onClick={() => setCount(text.length)} aria-label={`${text} Click to finish dialogue.`}><span className="quote-mark">“</span><span>{text.slice(0,count)}<i className={count < text.length ? 'typing' : ''}/></span><span className="dialogue-dots">···</span></button>;
}
function Cylinder({ chamber }: { chamber:number }) {
 return <svg viewBox="0 0 68 68" className="cylinder" role="img" aria-label={`${Math.min(chamber - 1,6)} trigger pulls used. Current chamber ${Math.min(chamber,6)}. Bullet position unknown.`}>
   <circle cx="34" cy="34" r="31" fill="#111a15" stroke="#51574a"/>
   {Array.from({length:6},(_,i) => { const angle = (i * 60 - 90) * Math.PI / 180, x = 34 + Math.cos(angle) * 20, y = 34 + Math.sin(angle) * 20;
   return <g key={i}><circle cx={x} cy={y} r="6.5" fill={i + 1 < chamber ? '#665d48' : '#0b100d'} stroke={i + 1 === chamber ? '#ddaf79' : '#505749'} strokeWidth={i + 1 === chamber ? 2 : 1}/>{i + 1 < chamber && <path d={`M${x-2} ${y-2}l4 4m0-4l-4 4`} stroke="#b6ac91" strokeWidth="1"/>}</g>; })}<circle cx="34" cy="34" r="3" fill="#9c9071"/>
 </svg>;
}
const demoPlayer: Card[] = [{suit:'spades',rank:'8',id:'demo-1'}, {suit:'hearts',rank:'K',id:'demo-2'}];

export default function App() {
 const {game, start, fold, go, pullTrigger} = useGame();
 const [muted, setMuted] = useState(false), [rulesOpen, setRulesOpen] = useState(false);
 const [scale, setScale] = useState(1);
 const rulesButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
 const intro = game.phase === 'START', over = game.phase === 'GAME_OVER';
 useLayoutEffect(() => { const resize = () => setScale(Math.max(.1, Math.min((window.innerWidth - 48)/1440, (window.innerHeight - 128)/810, 1.2))); resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
 useEffect(() => { if (rulesOpen) closeButton.current?.focus(); },[rulesOpen]);
 function toggleMute() { setMuted(value => { tableAudio.mute(!value); return !value; }); }
 function closeRules() { setRulesOpen(false); rulesButton.current?.focus(); }
 const ready = game.phase === 'PLAYER_DECISION';
 const shooting = game.phase === 'AI_SHOOTING' || game.phase === 'PLAYER_SHOOTING';
 const danger = game.revolver.currentChamber >= CONFIG.DANGER_CHAMBER && !intro;
 return <div className="app-shell">
  <header className="app-header">
   <a className="wordmark" href="./" aria-label="Last Hand home"><span className="brand-mark">✦</span> LAST HAND<span className="brand-dot">®</span></a>
   <div className="header-tagline">A PSYCHOLOGICAL CARD DUEL</div>
   <div className="header-actions"><button ref={rulesButton} className="text-button" onClick={() => setRulesOpen(true)}><CircleHelp size={15}/> How to play</button><span className="header-divider"/><button className={`sound-button ${muted ? 'is-muted' : ''}`} onClick={toggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}<span>SOUND {muted ? 'OFF' : 'ON'}</span></button></div>
  </header>
  <main className="main-frame">
   <div className="stage-viewport" style={{width:1440 * scale, height:810 * scale}}>
    <section className={`stage ${intro ? 'intro-scene' : 'active-scene'} ${game.shotEffect === 'shot' ? 'shot-shake' : game.shotEffect === 'click' ? 'click-shake' : ''} ${game.dead === 'player' ? 'player-death' : ''}`} style={{transform:`scale(${scale})`}} aria-label="Last Hand game table">
     <Scene intro={intro} danger={danger} suspense={game.suspense} dead={game.dead} blood={!!game.dead} lowGore={CONFIG.GORE_LEVEL === 'low'}/>
     <div className="scene-grain"/><div className="scene-corner top-left"/><div className="scene-corner top-right"/>
     {intro ? <>
      <div className="intro-shade"/>
      <div className="scene-index"><span className="live-dot"/> ONE SEAT LEFT <span className="index-line"/> 01 / 06</div>
      <div className="intro-copy"><div className="eyebrow"><span/> A GAME OF NERVE</div><h1>LAST<br/><span>HAND</span><i>♠</i></h1><p className="intro-subtitle">A quiet room. A stranger.<br/>A hand you can’t afford to lose.</p><button className="primary-button sit-button" onClick={start}><span>Sit down</span><ArrowRight size={21}/></button><div className="intro-meta">SINGLE PLAYER <span>·</span> 2–5 MINUTES <span>·</span> NO WAY TO CHEAT</div></div>
      <div className="intro-opponent-label"><span className="small-label">YOUR OPPONENT</span><span className="opponent-line"/><span className="opponent-name">The stranger</span></div>
      <div className="intro-quote">“Let’s see what your luck is worth.”</div>
      <div className="table-gun intro-gun"><Revolver/></div>
      <div className="intro-cards"><PlayingCard card={demoPlayer[0]}/><PlayingCard card={demoPlayer[1]} index={1}/></div>
      <div className="intro-rules"><div><span className="rule-number">01</span><p>Two cards.<br/><b>Higher total wins.</b></p></div><div><span className="rule-number">02</span><p>Lose the hand.<br/><b>Pull the trigger.</b></p></div><div><span className="rule-number">03</span><p>Six chambers.<br/><b>One last hand.</b></p></div></div>
      <div className="scene-bottom"><span>LUCK HAS A LIMIT.</span><span>EST. AT YOUR OWN RISK <ArrowUpRight size={12}/></span></div>
     </> : <>
      <div className="game-hud hud-left"><span className="small-label">FOLDS LEFT</span><div className="fold-indicators">{Array.from({length:3},(_,i) => <span key={i} className={i < game.folds ? 'full' : ''}/>)}<b>{game.folds} / 3</b></div></div>
      <div className="round-hud"><span className="live-dot"/><span>AT THE TABLE</span><b>ROUND {String(game.roundNumber).padStart(2,'0')}</b></div>
      <div className={`game-hud hud-right ${danger ? 'danger-hud' : ''}`}><div><span className="small-label">SHARED CYLINDER</span><b>CHAMBER {Math.min(game.revolver.currentChamber,6)} <span>/ 6</span></b></div><Cylinder chamber={game.revolver.currentChamber}/></div>
      <div className="side-note"><span className="vertical-rule"/><span className="small-label">THE RULE IS SIMPLE</span><p>Higher hand lives.<br/>Lower hand risks it.</p><div>ONE BULLET. NO RELOAD.</div></div>
      <div className="opponent-caption"><span className="small-label">THE STRANGER</span><span className="status-line"/>{game.revealed && game.round ? <b>{handTotal(game.round.ai)} <span>POINTS</span></b> : <b>?? <span>POINTS</span></b>}</div>
      <Typewriter text={game.dialogue}/>
      {game.round && <div className={`opponent-cards hand ${game.phase === 'DEALING' ? 'dealing' : ''}`} key={`ai-${game.roundNumber}`}><PlayingCard card={game.round.ai[0]}/><PlayingCard card={game.round.ai[1]} hidden={!game.revealed} index={1}/></div>}
      <div className={`table-gun ${shooting && game.suspense ? 'gun-lifted' : ''}`}><Revolver raised={shooting && game.suspense} ai={game.phase === 'AI_SHOOTING'}/></div>
      <div className={`result-line ${game.result ? `result-${game.result}` : ''}`} role="status">{game.message}</div>
      {game.round && <div className={`player-hand hand ${game.phase === 'DEALING' ? 'dealing' : ''}`} key={`player-${game.roundNumber}`}><PlayingCard card={game.round.player[0]}/><PlayingCard card={game.round.player[1]} index={1}/></div>}
      <div className="player-total"><span>YOUR TOTAL</span><b>{game.round ? handTotal(game.round.player) : '—'}</b><span className="total-dash"/> <span>{game.revealed && game.round ? `STRANGER: ${handTotal(game.round.ai)}` : 'MAKE IT COUNT.'}</span></div>
      <div className="game-actions">{game.phase === 'PLAYER_SHOOTING' ? <button className="primary-button trigger-button" disabled={!game.awaitingTrigger} onClick={pullTrigger}><Crosshair size={17}/>{game.awaitingTrigger ? 'PULL THE TRIGGER' : 'HOLD YOUR BREATH…'}</button> : <><button className="secondary-button fold-button" disabled={!ready || game.folds === 0} onClick={fold}>FOLD <span>{game.folds} LEFT</span></button><button className="primary-button go-button" disabled={!ready} onClick={go}><span>GO</span><ArrowRight size={19}/></button></>}</div>
      <div className="game-bottom"><span><Shield size={12}/> NO SECOND CHANCES. ONLY SECOND THOUGHTS.</span><span className={danger ? 'danger-text' : ''}>{danger ? 'THE ODDS ARE CLOSING IN.' : 'TRUST NOTHING. PLAY YOUR HAND.'}</span></div>
     </>}
     {game.shotEffect === 'shot' && <div className="muzzle-flash"/>}
     {game.dead === 'player' && CONFIG.GORE_LEVEL !== 'low' && <div className="blood-overlay"><svg viewBox="0 0 1440 810"><path d="M0 0L90 0l-30 100 70 100-100-30L0 270zm1440 0h-170l70 90-80 160 120-60 60 100zM0 810V650l120 40 100-35-20 80 100 75zm1440 0h-280l80-120 80 30 120-130z"/><g stroke="#b0b5a1" strokeWidth="1" fill="none" opacity=".5"><path d="M930 320l-230-70-180-140M930 320l130-290M930 320l330 140 180-20M930 320l-20 160 220 330M930 320L500 670l-80 140M700 250l-60 80-180 20M1060 30l10 160 180 20M910 480l-130 70-50 260"/></g></svg></div>}
     {over && <div className={`end-screen ${game.dead === 'ai' ? 'survived' : ''}`}><div className="end-content"><div className="end-emblem">{game.dead === 'ai' ? '♠' : '♣'}</div><span className="eyebrow">THE TABLE HAS DECIDED</span><h2>YOU<br/>{game.dead === 'ai' ? 'SURVIVED' : 'DIED'}<span>.</span></h2><p>{game.dead === 'ai' ? 'The stranger is silent. For once, so is the room.' : 'One more hand. One less chance.'}</p><div className="end-stats"><span>{game.roundNumber} HANDS DEALT</span><i/><span>{Math.min(game.revolver.currentChamber - 1,6)} TRIGGER PULLS</span></div><button className="primary-button" onClick={start}><RotateCcw size={17}/> Play again <ArrowRight size={18}/></button><span className="end-footnote">SAME TABLE. DIFFERENT ODDS.</span></div></div>}
    </section>
   </div>
  </main>
  <footer className="app-footer"><span>ONE TABLE. TWO STRANGERS. ONE BULLET.</span><span className="footer-center">✦</span><span>A FICTIONAL GAME OF CHANCE <span className="footer-dot">·</span> BUILT FOR THE BRAVE</span></footer>
  {rulesOpen && <div className="modal-backdrop" onClick={closeRules} onKeyDown={event => { if(event.key === 'Escape') closeRules(); }}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={event => event.stopPropagation()}><button className="close-button" ref={closeButton} onClick={closeRules} aria-label="Close rules"><X size={20}/></button><div className="eyebrow">BEFORE YOU TAKE A SEAT</div><h2 id="rules-title">Know the stakes.</h2><p className="rules-lead">Luck deals the cards. You make the call.</p><ol><li><span>01</span><div><h3>Read your hand.</h3><p>You get two cards. You see one of the stranger’s. Aces count as 1; face cards count as 10. The higher total wins.</p></div></li><li><span>02</span><div><h3>Go, or let it go.</h3><p>GO reveals the hidden card. FOLD skips the round safely, but you only get three. A tie costs neither a fold nor a shot.</p></div></li><li><span>03</span><div><h3>Face the chamber.</h3><p>The loser pulls the trigger. Six chambers, one bullet, no reload. Every empty click brings you both closer.</p></div></li></ol><div className="rules-warning">His words are a bluff. His cards aren’t.</div><button className="primary-button" onClick={closeRules}>Understood <ArrowRight size={18}/></button></section></div>}
 </div>;
}
