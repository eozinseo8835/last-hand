import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX, X, CircleHelp, RotateCcw, Crosshair, Mouse, MoveUpRight, Eye } from 'lucide-react';
import Scene from './Scene';
import { CONFIG, handScore, type Card } from './game';
import { useGame } from './useGame';
import { tableAudio } from './audio';
import Typewriter from './Typewriter';
import HoldTrigger from './HoldTrigger';
import { HOST, OPPONENTS, type RunStats } from './campaign';
import { FINAL_HOST_LINE } from './campaignDialogue';
import { opponentCardReadout } from './presentation';

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

function RunSummary({ stats, guests }: { stats: RunStats; guests: number }) {
  const seconds = Math.floor(stats.totalTimeMs / 1000);
  const entries = [
    ['ROOMS CLEARED', `${stats.roomsCleared} / 3`], ['ROUNDS PLAYED', stats.roundsPlayed],
    ['HANDS WON / LOST / PUSHED', `${stats.handsWon} / ${stats.handsLost} / ${stats.handsPushed}`],
    ['HITS / BUSTS', `${stats.hits} / ${stats.busts}`], ['FOLDS USED', stats.foldsUsed],
    ['HIGHEST CHAMBER', stats.highestChamber], ['FORCED SHOTS', stats.forcedShots],
    ['YOUR SPIN / PEEK', `${stats.abilitiesUsed.player.spin} / ${stats.abilitiesUsed.player.peek}`],
    ['OPPONENT SPIN / PEEK', `${stats.abilitiesUsed.ai.spin} / ${stats.abilitiesUsed.ai.peek}`],
    [stats.guestsRemainingWhenFell === null ? 'GUESTS REMAINING' : 'GUESTS WHEN YOU FELL', stats.guestsRemainingWhenFell ?? guests],
    ['TOTAL TIME', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
  ];
  return <dl className="run-stats" aria-label="Run statistics">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export default function App() {
  const { game, start, fold, hit, stand, beginTriggerHold, endTriggerHold, spinCylinder, peek, finishSpeech, advanceOpening, skipOpening, setOpponentInView } = useGame();
  const [muted, setMuted] = useState(false), [rulesOpen, setRulesOpen] = useState(false);
  const [scale, setScale] = useState(1), [recenterToken, setRecenterToken] = useState(0);
  const rulesButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const [forceContact,setForceContact]=useState(false);
  useEffect(()=>{setForceContact(false);if(game.phase!=='HOST_FORCE_SHOT'||game.forceShotAt==null)return;const timer=setTimeout(()=>setForceContact(true),Math.max(0,1100-(Date.now()-game.forceShotAt)));return()=>clearTimeout(timer);},[game.phase,game.forceShotAt]);
  const [volumes,setVolumes]=useState({master:.7,effects:.8,voice:1});
  useEffect(()=>{tableAudio.setVolumes?.(volumes);},[volumes]);
  const volumeControl=(key:'master'|'effects'|'voice')=><label>{key==='master'?'Master volume':key==='effects'?'Effects volume':'Voice volume'}<input aria-label={key==='master'?'Master volume':key==='effects'?'Effects volume':'Voice volume'} type="range" min="0" max="1" step=".01" value={volumes[key]} onChange={e=>setVolumes(v=>({...v,[key]:Number(e.target.value)}))}/></label>;
  const intro = game.phase === 'START', over = game.phase === 'GAME_OVER';
  const opening = game.phase === 'OPENING';
  const story = opening || game.phase === 'TRANSITION' || game.phase === 'ENDING_WIN' || game.phase === 'ENDING_DEATH';
  const opponent = OPPONENTS[game.roomNumber];
  const speaker = game.speech?.speaker ?? null;
  const speakerName = speaker === 'host' ? HOST.name : opponent.name;
  const ready = game.phase === 'PLAYER_DECISION' && game.tiesCut?.player !== false;
  const playerScore = handScore(game.round?.player ?? []);
  const dealerScore = handScore(game.round?.ai ?? []);
  const danger = !intro && game.revolver.currentChamber >= CONFIG.DANGER_CHAMBER;
  const chambersFired = Math.max(0, game.revolver.currentChamber - 1);
  const heartbeatActive = ready || game.suspense || game.phase === 'PLAYER_SHOOTING' || game.phase === 'AI_SHOOTING';
  useLayoutEffect(() => {
    const resize = () => setScale(Math.max(.1, Math.min((window.innerWidth - 40) / 1440, (window.innerHeight - 108) / 810, 1.5)));
    resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { if (rulesOpen) closeButton.current?.focus(); }, [rulesOpen]);
  useEffect(() => {
    tableAudio.setHeartbeat({ active: heartbeatActive && !game.dead, chambersFired, pulling: game.triggerHeld || forceContact, urgency: game.triggerRemainingMs == null ? 0 : Math.max(0, 1 - game.triggerRemainingMs / 10000) });
    return () => tableAudio.setHeartbeat({ active: false, chambersFired: 0, pulling: false });
  }, [heartbeatActive, chambersFired, forceContact, game.triggerHeld, game.dead, game.triggerRemainingMs == null ? null : Math.ceil(game.triggerRemainingMs / 1000)]);
  useEffect(() => {
    tableAudio.setEvent(game.event);
    return () => tableAudio.setEvent(null);
  }, [game.event]);
  function openRules() { endTriggerHold(); setRulesOpen(true); }
  function closeRules() { setRulesOpen(false); rulesButton.current?.focus(); }
  function toggleMute() { setMuted(value => { tableAudio.mute(!value); return !value; }); }
  return <div className="app-shell">
    <header className="app-header">
      <a className="wordmark" href="./" aria-label="Last Hand home"><span className="brand-mark"><i/><i/></span>LAST HAND<span className="wordmark-version">/ 06</span></a>
      <div className="header-tagline"><span className="signal-dot"/> NO SIGNAL. NO WITNESSES.</div>
      <div className="header-actions"><details className="audio-settings"><summary>Audio settings</summary><div>{volumeControl('master')}{volumeControl('effects')}{volumeControl('voice')}</div></details><button className="text-button" ref={rulesButton} onClick={openRules}><CircleHelp size={15}/>How to play</button><span className="header-divider"/><button className="sound-button" onClick={toggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}<span>{muted ? 'MUTED' : 'SOUND ON'}</span></button></div>
    </header>
    <main className="main-frame">
      <div className="stage-viewport" style={{ width: 1440 * scale, height: 810 * scale }}>
        <section className={`stage ${intro ? 'intro-scene' : 'active-scene'} ${danger ? 'danger-stage' : ''} ${story ? 'story-scene' : ''} ${game.cinematic ? 'has-cinematic' : ''}`} data-room={game.roomNumber} data-story-stage={game.storyStage} style={{ transform: `scale(${scale})` }} aria-label="Last Hand game table">
          <Scene phase={game.phase} round={game.round} roundNumber={game.roundNumber} revealed={game.revealed} suspense={game.suspense} dead={game.dead} shotEffect={game.shotEffect} danger={danger} recenterToken={recenterToken} lookDisabled={rulesOpen || over} chambersFired={chambersFired} tell={game.tell} triggerHeld={game.triggerHeld} triggerProgress={game.triggerProgress} spinning={game.spinning} spinSerial={game.spinSerial} peekActor={game.peekActor} peekSerial={game.peekSerial} peekedCard={game.peekActor === 'player' ? game.round?.deck[0] : game.peekedCard} event={game.event} roomNumber={game.roomNumber} speaker={speaker} addressedTo={game.speech?.addressedTo} feedDeaths={game.feedDeaths} feedDeathSerial={game.feedDeathSerial} storyStage={game.storyStage} cinematic={game.cinematic} tiesCut={game.tiesCut} distantShot={game.distantShot} ambientEvent={game.ambientEvent} aiShotStartedAt={game.aiShotStartedAt} aiShotDurationMs={game.aiShotDurationMs ?? undefined} gunTransfer={game.gunTransfer} attention={game.attention} stress={game.stress} caught={game.caught} peekStartedAt={game.peekStartedAt} forceShotAt={game.forceShotAt} onOpponentInView={setOpponentInView}/>
          <div className="scene-edge"/>
          <div className="hud-layer">
            <div className="scene-corner top-left"/><div className="scene-corner top-right"/><div className="scene-corner bottom-left"/><div className="scene-corner bottom-right"/>
            {intro ? <>
              <div className="intro-shade"/>
              <div className="scene-index"><span className="live-dot"/> SUBLEVEL 06 <span className="index-line"/> PRIVATE TABLE</div>
              <div className="intro-copy">
                <div className="eyebrow"><span/> A GAME OF NERVE</div>
                <h1>LAST<br/><span>HAND</span><i>♠</i></h1>
                <p className="intro-subtitle">Eight guests. Four tables. One door.<br/>A hand you can’t afford to lose.</p>
                <button className="primary-button sit-button" onClick={start}><span>Sit down</span><ArrowRight size={20}/></button>
                <p className="audio-notice">Headphones recommended. Gunshots are loud.</p><div className="intro-volume">{volumeControl('master')}</div><div className="intro-meta">SINGLE PLAYER <span>/</span> THREE ROOMS <span>/</span> ONE SURVIVOR</div>
              </div>
              <div className="intro-room-label"><span>THE HOST IS WAITING.</span><i/><small>THE AUDIENCE IS ALREADY HERE.</small></div>
              <div className="intro-rules"><div><span>01</span><p>Get close to 21.<br/><b>Never go over.</b></p></div><div><span>02</span><p>Lose the hand.<br/><b>Pull the trigger.</b></p></div><div><span>03</span><p>Six chambers.<br/><b>One bullet.</b></p></div></div>
            </> : <>
              <div className="game-hud hud-left"><span className="small-label">FOLDS LEFT</span><div className="fold-indicators">{Array.from({ length: 3 }, (_, i) => <span key={i} className={i < game.folds ? 'full' : ''}/>)}<b>{game.folds} / 3</b></div><span className="ability-summary" aria-label={`Your abilities: SPIN ${Number(game.abilities.player.spin)}, PEEK ${Number(game.abilities.player.peek)}`}>SPIN {Number(game.abilities.player.spin)} · PEEK {Number(game.abilities.player.peek)}</span></div>
              <div className="round-hud campaign-hud"><div><span className="live-dot"/> <b>ROOM {game.roomNumber} / 3</b><i/><span>ROUND {String(game.roundNumber).padStart(2, '0')}</span></div><span className="opponent-name">{opponent.name}</span><span className="guest-count" role="status">GUESTS REMAINING: {game.guestsRemaining}</span></div>
              <div className={`game-hud hud-right ${danger ? 'danger-hud' : ''}`}><div><span className="small-label">SHARED CYLINDER</span><b>CHAMBER {Math.min(game.revolver.currentChamber, 6)} <span>/ 6</span></b><span className="ability-summary" aria-label={`${opponent.name} abilities: SPIN ${Number(game.abilities.ai.spin)}, PEEK ${Number(game.abilities.ai.peek)}`}>SPIN {Number(game.abilities.ai.spin)} · PEEK {Number(game.abilities.ai.peek)}</span></div><Cylinder chamber={game.revolver.currentChamber}/></div>
              {!story && !over && <div className="opponent-readout"><span className="small-label">{opponent.name}</span><span className="opponent-card-readout" aria-label={`Visible cards for ${opponent.name}`}>{opponentCardReadout(game.round?.ai ?? [], game.revealed)}</span><b>{game.revealed && game.round ? <>{dealerScore.soft && <small className="soft-prefix">Soft </small>}{dealerScore.total}</> : '??'}<small> POINTS</small></b></div>}
              {game.speech && !over && <div className={`stranger-transmission speaker-${speaker}`} data-speaker={speaker} data-speech-id={game.speech.id}>
                <div className="opponent-caption"><span className="small-label speaker-label">{speakerName}</span><span className="transmission-line"/></div>
                <Typewriter key={game.speech.id} text={game.speech.text} category={game.speech.category} danger={game.speech.danger} chambersFired={game.speech.chambersFired} speaker={game.speech.speaker} profile={speaker === 'host' ? HOST.voice : opponent.voice} behind={game.phase === 'ENDING_WIN' && game.speech.text === FINAL_HOST_LINE} onFinish={finishSpeech}/>
                <span className="transmission-hint">CLICK TO FINISH LINE</span>
              </div>}
              <div className={`result-line ${game.result ? `result-${game.result}` : ''}`} role="status">{game.message}</div>
              {!story && !over && <div className="player-readout"><span className="small-label">YOUR HAND</span><div className="player-total" aria-label={`Your total: ${playerScore.soft ? 'Soft ' : ''}${playerScore.total}`}><b>{playerScore.soft && <small className="soft-prefix">Soft </small>}{game.round?.player.length ? playerScore.total : '—'}</b><span>YOUR TOTAL<br/><small>{playerScore.bust ? 'BUST' : 'CLOSEST TO 21 WINS'}</small></span></div></div>}
              {!story && !over && <div className="game-actions">{game.phase === 'HOST_FORCE_SHOT' ? <span className="host-enforcement">THE HOST IS COMPLETING YOUR TURN.</span> : game.phase === 'PLAYER_SHOOTING' ? <>
                {game.abilities.player.spin && <button className="secondary-button spin-button" onClick={spinCylinder} disabled={!game.awaitingTrigger || game.triggerHeld || game.triggerProgress > 0 || !!game.spinning}>SPIN CYLINDER<RotateCcw size={15}/></button>}
                {game.triggerRemainingMs != null && <span className={`trigger-countdown ${game.triggerRemainingMs < 5000 ? 'urgent' : ''}`} role="timer" aria-label="Time remaining before Host assistance">{Math.ceil(game.triggerRemainingMs / 1000)}s</span>}
                <HoldTrigger progress={game.triggerProgress} holding={game.triggerHeld} disabled={!game.awaitingTrigger || !!game.spinning || rulesOpen} onHold={beginTriggerHold} onRelease={endTriggerHold}/>
              </> : <>
                <button className="secondary-button fold-button" disabled={!ready || game.hasHit || game.folds === 0} onClick={fold} title={game.hasHit ? 'Folding is only available before your first hit.' : `${game.folds} folds remaining`}><span>FOLD</span><small>{game.folds} LEFT</small></button>
                <button className={`secondary-button peek-button ${game.attention?.window ? 'peek-window' : ''}`} disabled={!ready || !game.abilities.player.peek || !game.attention?.window} onClick={peek} title="Wait until both the Host and captive look away. Once per room."><Eye size={14}/>PEEK<small>{Number(game.abilities.player.peek)} LEFT</small></button>
                <button className="secondary-button hit-button" disabled={!ready} onClick={hit}>HIT<span>+</span></button>
                <button className="primary-button stand-button" disabled={!ready} onClick={stand}><span>STAND</span><ArrowRight size={20}/></button>
              </>}</div>}
              {game.peekedCard && <span className="peek-note" role="status">You saw: {game.peekedCard.rank}{SUIT[game.peekedCard.suit]}</span>}
              {game.caught === 'ai' && <span className="caught-note" role="status">CAUGHT</span>}
              <div className="sr-only"><div className="opponent-cards">{game.round?.ai.map((card, i) => <CardDescription key={card.id} card={card} hidden={i === 1 && !game.revealed}/>)}</div><div className="player-cards">{game.round?.player.map(card => <CardDescription key={card.id} card={card}/>)}</div></div>
            </>}
            <div className="look-controls"><span><Mouse size={13}/> DRAG OR WASD TO LOOK</span><button className="recenter-button" onClick={() => setRecenterToken(token => token + 1)}><Crosshair size={14}/> Recenter</button></div>
            <div className="scene-bottom"><span>{intro ? 'LUCK HAS A LIMIT.' : danger ? 'THE ODDS ARE CLOSING IN.' : 'TRUST NOTHING. PLAY YOUR HAND.'}</span><span>ONE BULLET. NO SECOND CHANCES.<MoveUpRight size={11}/></span></div>
          </div>
          {game.shotEffect === 'shot' && <div className="muzzle-flash"/>}
          {game.dead === 'player' && (game.phase === 'ROUND_RESULT' || (game.phase === 'ENDING_DEATH' && game.storyStage === 'fall')) && <div className={`player-death-overlay ${CONFIG.GORE_LEVEL === 'low' ? 'low-gore' : ''}`}>
            {CONFIG.GORE_LEVEL !== 'low' && <svg className="blood-overlay" viewBox="0 0 1440 810"><path d="M0 0h130l-65 110 95 80-130-40L0 290zm1440 0h-165l75 95-70 155 100-65 60 110zM0 810V650l120 40 100-35-20 80 100 75zm1440 0h-280l80-120 80 30 120-130z"/><g stroke="#d0d2bb" strokeWidth="1" fill="none" opacity=".4"><path d="M930 320l-230-70-180-140M930 320l130-290M930 320l330 140 180-20M930 320l-20 160 220 330M930 320L500 670l-80 140M700 250l-60 80-180 20M1060 30l10 160 180 20M910 480l-130 70-50 260"/></g></svg>}
          </div>}
          {opening && <div className="opening-controls"><span>{game.cinematic?.mode === 'arrival' ? `ROOM ${game.roomNumber} / 3` : game.introShort ? 'WELCOME BACK.' : `THE RULES · ${Math.min(game.introIndex + 1, 6)} / 6`}</span><button className="secondary-button" onClick={advanceOpening} disabled={game.storyStage !== 'rules'}>Continue<ArrowRight size={17}/></button><button className="text-button skip-opening" onClick={skipOpening}>Skip introduction</button></div>}
          {story && <div className={`story-overlay story-${game.phase.toLowerCase()} story-${game.storyStage}`} aria-hidden="true"><div className="hood-fabric"/><span className="story-room-label">{game.phase === 'TRANSITION' ? `ROOM ${game.roomNumber} / 3` : ''}</span>{game.phase === 'ENDING_DEATH' && game.storyStage === 'no-signal' && <span className="no-signal">NO SIGNAL</span>}{game.phase === 'ENDING_WIN' && game.storyStage === 'title' && <span className="ending-title">LAST HAND</span>}</div>}
          {over && <div className="end-screen campaign-end"><div className="end-content"><span className="eyebrow">TRANSMISSION ENDED</span><h2>{game.stats.roomsCleared === 3 ? 'SURVIVED' : 'YOU DIED'}<span>.</span></h2><p>{game.stats.roomsCleared === 3 ? 'One guest. One open door.' : `Room ${game.roomNumber}. Your seat is empty.`}</p><RunSummary stats={game.stats} guests={game.guestsRemaining}/><button className="primary-button" onClick={start}><RotateCcw size={17}/>Play Again<ArrowRight size={18}/></button><span className="end-footnote">THE AUDIENCE WILL BE WAITING.</span></div></div>}
        </section>
      </div>
    </main>
    <footer className="app-footer"><span>EIGHT GUESTS. ONE DOOR.</span><span className="footer-tick">— — —</span><span>LAST HAND <i>/</i> A FICTIONAL GAME OF CHANCE</span></footer>
    {rulesOpen && <div className="modal-backdrop" onClick={closeRules} onKeyDown={event => { if (event.key === 'Escape') closeRules(); }}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={event => event.stopPropagation()}><button className="close-button" ref={closeButton} onClick={closeRules} aria-label="Close rules"><X size={20}/></button><div className="eyebrow">BEFORE YOU TAKE A SEAT</div><h2 id="rules-title">KNOW THE STAKES.</h2><p className="rules-lead">Luck deals the cards. You make the call.</p><ol><li><span>01</span><div><h3>READ YOUR HAND.</h3><p>Get closer to 21 than your opponent without going over. Face cards count as 10. Aces count as 11, or 1 to keep you from busting. A soft total still counts an Ace as 11.</p></div></li><li><span>02</span><div><h3>HIT, STAND, OR FOLD.</h3><p>HIT draws another card. STAND reveals your opponent’s hand. Each captive has a different approach: the Nervous Man stops early and makes mistakes, the Gambler hits soft 17, and the Survivor stands on 17. FOLD skips safely before your first HIT, up to three times per room.</p></div></li><li><span>03</span><div><h3>FACE THE CHAMBER.</h3><p>A bust loses the hand. Equal totals are a PUSH: nobody shoots. Otherwise, the loser faces the shared revolver. Hold HOLD TO PULL continuously; releasing cancels the pull. Six chambers, one bullet.</p></div></li><li><span>04</span><div><h3>ONE LAST ADVANTAGE.</h3><p>Each side gets one SPIN and one PEEK per match. SPIN resets all six chambers before your shot. PEEK is a one-second cheat: wait until both faces turn away. If either turns back, you face a penalty. Your opponent may peek only while the Host and you look away; look back to catch it. SPIN resets the cylinder once per room before your shot.</p></div></li></ol><div className="rules-warning">Watch the captive. Their body may give them away, or lie. The Host never plays. If you wait fifteen seconds without holding, it completes your required shot for you.</div><button className="primary-button" onClick={closeRules}>Understood<ArrowRight size={18}/></button></section></div>}
  </div>;
}
