/**
 * Online mode: create or join a room with a code, wait in the lobby (up to 8 guests; empty seats get
 * computer guests), then play 1v1 tables through the 8 → 4 → 2 → 1 bracket in the same 3D room as story mode.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Users } from 'lucide-react';
import Scene, { type GraphicsMode } from '../Scene';
import HoldTrigger from '../HoldTrigger';
import { CONFIG, handScore, type Card } from '../game';
import { tableAudio } from '../audio';
import { useOnline } from './useOnline';
import { onlineSceneProps, type LocalTrigger } from './onlineScene';
import { isHidden, MAX_SEATS, SPIN_MS, type RoomView } from './protocol';
import { SPIN_SWIPE_MS } from '../gunTransfer';

const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const cardText = (c: Card) => `${c.rank}${SUIT[c.suit]}`;

export default function OnlineGame({ playerName, graphics, onExit }: { playerName: string; graphics: GraphicsMode; onExit: () => void }) {
  const online = useOnline(playerName);
  const { view, status, error } = online;
  const [codeDraft, setCodeDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [trigger, setTrigger] = useState<LocalTrigger>({ held: false, progress: 0 });
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const holdStart = useRef<number | null>(null), pulled = useRef(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);
  useEffect(() => { tableAudio.init(); }, []);
  // Server messages ("Wait for the deal.") fade on their own.
  useEffect(() => { if (!error) return; const id = setTimeout(online.clearError, 3500); return () => clearTimeout(id); }, [error]);

  const table = view?.table ?? null;
  const shooting = table?.phase === 'shooting' && table.shooter === table.me;
  const toLocal = (serverTime: number) => serverTime - online.clockOffset;
  const spinBusy = !!table?.spin && now < toLocal(table.spin.at) + SPIN_MS;
  const gunArriving = !!table && table.phase === 'shooting' && now - toLocal(table.phaseStartedAt) < 1500;
  // Holding the trigger: three seconds, as in story mode; releasing early lets the hammer back down.
  useEffect(() => {
    if (!trigger.held) return;
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - (holdStart.current ?? Date.now())) / CONFIG.TRIGGER_HOLD_MS);
      setTrigger(t => ({ ...t, progress }));
      if (progress >= 1 && !pulled.current) { pulled.current = true; online.act('pull'); return; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [trigger.held]);
  useEffect(() => { if (!shooting) { holdStart.current = null; pulled.current = false; setTrigger({ held: false, progress: 0 }); } }, [shooting, table?.round]);
  // A released trigger eases back down, as in story mode.
  useEffect(() => {
    if (trigger.held || trigger.progress <= 0 || pulled.current) return;
    const from = trigger.progress, started = Date.now(); let frame = 0;
    const drain = () => { const f = Math.min(1, (Date.now() - started) / 600); setTrigger(t => (t.held ? t : { ...t, progress: from * (1 - f) })); if (f < 1) frame = requestAnimationFrame(drain); };
    frame = requestAnimationFrame(drain); return () => cancelAnimationFrame(frame);
  }, [trigger.held]);
  function holdTrigger() {
    if (!shooting || spinBusy || gunArriving) return;
    holdStart.current = Date.now(); pulled.current = false; setTrigger({ held: true, progress: 0 }); online.act('hold');
    // The hammer cocks a third of the way in, the cylinder clacks at two thirds.
    const started = holdStart.current;
    later(() => { if (holdStart.current === started) tableAudio.play('hammer'); }, CONFIG.TRIGGER_HOLD_MS / 3);
    later(() => { if (holdStart.current === started) tableAudio.play('clack'); }, CONFIG.TRIGGER_HOLD_MS * 2 / 3);
  }
  function releaseTrigger() {
    if (pulled.current) return;
    holdStart.current = null; setTrigger(t => ({ ...t, held: false })); online.act('release');
  }
  // Story-mode sounds for what happens at the table (driven by the server's view, so both players hear the same moments).
  const heard = useRef(new Set<string>());
  const once = (key: string, fn: () => void) => { if (heard.current.has(key)) return; heard.current.add(key); if (heard.current.size > 400) heard.current.clear(); fn(); };
  useEffect(() => {
    if (!table) return;
    const id = `${view!.bracketRoom}:${table.id}:${table.round}`;
    if (table.phase === 'dealing') once(`deal:${id}`, () => { tableAudio.play('card'); later(() => tableAudio.play('card'), 350); });
    if (table.phase === 'shooting' && table.shooter !== table.me && table.hold) {
      const hold = table.hold;
      once(`hold:${id}:${hold.startedAt}`, () => { tableAudio.play('tension'); later(() => tableAudio.play('hammer'), Math.min(900, hold.duration * .55)); });
    }
    if (table.spin) once(`spin:${id}:${table.spin.at}`, () => later(() => tableAudio.play('spin'), Math.max(0, toLocal(table.spin!.at) + SPIN_SWIPE_MS - Date.now())));
    if (table.phase === 'forced' && table.forcedAt !== null) once(`forced:${id}`, () => {
      const at = toLocal(table.forcedAt!);
      later(() => tableAudio.playContact('metal', 1), Math.max(0, at + 2200 - Date.now()));
      later(() => tableAudio.play('hammer'), Math.max(0, at + 2800 - Date.now()));
    });
  }, [table?.phase, table?.hold?.startedAt, table?.spin?.at, table?.round]);
  useEffect(() => { if (table && table.myCards.length > 2) tableAudio.play('card'); }, [table?.myCards.length]);
  // The heartbeat quickens with the chambers spent and while a trigger is in play.
  const chambersFired = table ? table.currentChamber - 1 : 0;
  useEffect(() => {
    const active = !!table && ['deciding', 'reveal', 'shooting', 'forced'].includes(table.phase);
    tableAudio.setHeartbeat({ active, chambersFired, pulling: trigger.held || table?.phase === 'forced', urgency: shooting ? Math.max(0, 1 - (toLocal(table!.phaseEndsAt) - now) / 10000) : 0 });
  }, [table?.phase, chambersFired, trigger.held, shooting && Math.ceil((toLocal(table!.phaseEndsAt) - now) / 1000)]);
  useEffect(() => () => tableAudio.setHeartbeat({ active: false, chambersFired: 0, pulling: false }), []);
  // Shot sounds come from the result the server sends.
  const lastShot = useRef<string>('');
  useEffect(() => {
    const shot = table?.shot; if (!shot) return;
    const key = `${table!.id}:${table!.round}:${shot.at}`; if (lastShot.current === key) return; lastShot.current = key;
    if (shot.fired) tableAudio.playShot({ id: key, kind: 'local', roomId: Math.min(3, view?.bracketRoom ?? 1) as 1 | 2 | 3 });
    else { tableAudio.play('click'); if (shot.seat !== table!.me) tableAudio.playStory('gasp'); }
  }, [table?.shot?.at]);

  const leave = () => { online.leave(); onExit(); };
  const scene = onlineSceneProps(view, online.clockOffset, trigger, now);
  const secondsLeft = table ? Math.max(0, Math.ceil((table.phaseEndsAt - online.clockOffset - now) / 1000)) : 0;
  const opponentName = table && view ? view.seats[table.opponent]?.name : '';

  return <>
    <Scene key={graphics} graphics={graphics} recenterToken={0} {...scene}/>
    <div className="scene-edge"/>
    <div className="hud-layer online-hud">
      <div className="scene-corner top-left"/><div className="scene-corner top-right"/><div className="scene-corner bottom-left"/><div className="scene-corner bottom-right"/>
      {(!view || status === 'idle') && status !== 'queue' && <OnlineStart status={status} codeDraft={codeDraft} setCodeDraft={setCodeDraft} onCreate={online.create} onJoin={() => online.join(codeDraft)} onFind={online.findMatch} onBack={leave} playerName={playerName}/>}
      {status === 'queue' && <div className="online-panel queue">
        <span className="small-label">FINDING GUESTS</span>
        <h2>{online.queue ? `${online.queue.players} waiting` : 'Joining the queue…'}</h2>
        <p className="queue-time">{online.queue ? `${Math.floor(Math.max(0, now - online.queue.since) / 1000)}s` : ''}</p>
        <p>When eight guests are waiting the game starts at once. With two or more, it starts after a short wait and computer guests take the empty seats.</p>
        {online.queue?.canStartAlone && <button className="primary-button sit-button" onClick={online.startNow}><span>Start with computer guests</span><ArrowRight size={18}/></button>}
        <button className="text-button" onClick={online.cancelQueue}><ArrowLeft size={14}/>Cancel</button>
      </div>}
      {view?.stage === 'lobby' && <OnlineLobby view={view} now={now - 0} clockOffset={online.clockOffset} onStart={online.start} onLeave={leave}/>}
      {view && view.stage !== 'lobby' && <div className="online-topbar">
        <span><span className="rec-dot"/>LIVE · ROOM {view.code}</span><b>ROOM {view.bracketRoom} / 3</b><span>GUESTS REMAINING: {view.guestsRemaining}</span>
      </div>}
      {view?.stage === 'playing' && table && <>
        <div className="online-opponent"><span className="small-label">{opponentName}</span>
          <p>{table.opponentCards.map(c => isHidden(c) ? '??' : cardText(c)).join('  ')}</p>
          <small>{table.phase === 'deciding' ? (table.opponentDone ? 'STANDS' : 'DECIDING…') : ''}</small></div>
        <div className="player-readout online-readout"><span className="small-label">{playerName} · YOUR HAND</span>
          <div className="player-total"><b>{handScore(table.myCards).total}</b></div><small>{table.myCards.map(cardText).join('  ')}</small></div>
        {(table.phase === 'deciding' || shooting) && <div className="online-clock" aria-label={`${secondsLeft} seconds left`}>{secondsLeft}s</div>}
        <div className="game-actions online-actions">
          {table.phase === 'deciding' && !table.myDone && <>
            <button className="secondary-button" disabled={table.folds <= 0 || table.myCards.length > 2} onClick={() => online.act('fold')}>FOLD <small>{table.folds} LEFT</small></button>
            <button className="secondary-button" onClick={() => online.act('hit')}>HIT +</button>
            <button className="primary-button" onClick={() => online.act('stand')}>STAND <ArrowRight size={16}/></button>
          </>}
          {table.phase === 'deciding' && table.myDone && <span className="online-wait">Waiting for {opponentName}…</span>}
          {shooting && <>
            <button className="secondary-button" disabled={table.spinUsed || trigger.held || trigger.progress > 0 || spinBusy || gunArriving}
              onClick={() => online.act('spin')}>SPIN CYLINDER</button>
            <HoldTrigger progress={trigger.progress} holding={trigger.held} disabled={spinBusy || gunArriving} onHold={holdTrigger} onRelease={releaseTrigger}/>
          </>}
          {table.phase === 'shooting' && !shooting && <span className="online-wait">{table.hold ? `${opponentName} raises the revolver…` : spinBusy ? 'The cylinder turns…' : `${opponentName} holds the revolver…`}</span>}
          {table.phase === 'forced' && <span className="host-enforcement">{table.shooter === table.me ? 'THE HOST IS COMPLETING YOUR TURN.' : 'THE HOST IS COMPLETING THEIR TURN.'}</span>}
          {shooting && <span className="online-hint">{trigger.held ? 'Keep holding. Do not let go.' : spinBusy ? 'The cylinder turns. Six chambers again.' : gunArriving ? '' : 'Hold to pull. Releasing lets the hammer back down.'}</span>}
        </div>
        <ResultLine view={view}/>
      </>}
      {view?.stage === 'playing' && !table && <div className="online-banner">{view.seats[view.you]?.alive ? 'You survived this room. Waiting for the other tables…' : 'You are out. You are the audience now.'}<Feeds view={view}/></div>}
      {view?.stage === 'playing' && table?.phase === 'over' && <div className="online-banner">{table.winner === table.me ? 'You survived this table. Waiting for the other tables…' : 'You are out. You are the audience now.'}<Feeds view={view}/></div>}
      {view?.stage === 'finished' && <div className="online-banner finished"><span className="small-label">THE LAST GUEST</span><h2>{view.winner !== null ? view.seats[view.winner].name : '—'}</h2>
        <p>{view.winner === view.you ? 'The door opens for you. The audience has voted.' : 'The door opens. Not for you.'}</p>
        <button className="primary-button" onClick={leave}>Back to menu</button></div>}
      {error && <div className="online-error" role="alert" onClick={online.clearError}>{error}</div>}
      {status === 'reconnecting' && <div className="online-error">Connection lost. Reconnecting…</div>}
      {view && view.stage !== 'finished' && <button className="text-button online-leave" onClick={leave}><ArrowLeft size={14}/>Leave</button>}
    </div>
  </>;
}

function OnlineStart({ status, codeDraft, setCodeDraft, onCreate, onJoin, onFind, onBack, playerName }: {
  status: string; codeDraft: string; setCodeDraft: (v: string) => void; onCreate: () => void; onJoin: () => void; onFind: () => void; onBack: () => void; playerName: string;
}) {
  const busy = status === 'connecting';
  return <div className="online-panel">
    <span className="small-label">ONLINE · UP TO 8 GUESTS</span>
    <h2>Private table</h2>
    <p>Playing as <b>{playerName}</b>. Find a match with other guests, or open a private room and share its code.</p>
    <button className="primary-button sit-button" disabled={busy} onClick={onFind}><span>Find a match</span><ArrowRight size={18}/></button>
    <span className="small-label or-label">OR PLAY WITH FRIENDS</span>
    <button className="secondary-button" disabled={busy} onClick={onCreate}>{busy ? 'Opening…' : 'Create private room'}</button>
    <form className="join-row" onSubmit={e => { e.preventDefault(); onJoin(); }}>
      <input aria-label="Room code" placeholder="CODE" maxLength={4} value={codeDraft} onChange={e => setCodeDraft(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false}/>
      <button className="secondary-button" type="submit" disabled={busy || codeDraft.length < 4}>Join</button>
    </form>
    <button className="text-button" onClick={onBack}><ArrowLeft size={14}/>Back</button>
  </div>;
}

function OnlineLobby({ view, now, clockOffset, onStart, onLeave }: { view: RoomView; now: number; clockOffset: number; onStart: () => void; onLeave: () => void }) {
  const isHost = view.seats[view.you]?.host, humans = view.seats.filter(s => s.kind === 'human').length;
  const autoIn = view.autoStartAt ? Math.max(0, Math.ceil((view.autoStartAt - clockOffset - now) / 1000)) : null;
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(view.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return <div className="online-panel lobby">
    <span className="small-label">ROOM CODE</span>
    <button className="room-code" onClick={copy} aria-label={`Room code ${view.code}, copy`}>{view.code}<Copy size={16}/></button>
    <small>{copied ? 'Copied.' : 'Share this code. Friends choose Online 1v1 → Join.'}</small>
    <ol className="seat-list" aria-label="Seats">
      {Array.from({ length: MAX_SEATS }, (_, i) => { const s = view.seats[i]; return <li key={i} className={`${s.kind} ${i === view.you ? 'you' : ''}`}>
        <span>{String(i + 1).padStart(2, '0')}</span><b>{s.kind === 'human' ? s.name : 'empty seat'}</b><small>{s.host ? 'HOST' : i === view.you ? 'YOU' : ''}</small></li>; })}
    </ol>
    <p className="lobby-note"><Users size={13}/> {humans} of 8 seated. Empty seats are filled by computer guests when the game starts.</p>
    {autoIn !== null ? <p className="lobby-note">Matched. The game starts when everyone is seated (at most {autoIn}s).</p>
      : isHost ? <button className="primary-button sit-button" onClick={onStart}><span>Start the game</span><ArrowRight size={18}/></button> : <p className="lobby-note">Waiting for the host to start…</p>}
    <button className="text-button" onClick={onLeave}><ArrowLeft size={14}/>Leave room</button>
  </div>;
}

function ResultLine({ view }: { view: RoomView }) {
  const t = view.table!; if (t.phase !== 'result' && t.phase !== 'reveal') return null;
  const opp = view.seats[t.opponent]?.name;
  const text = t.phase === 'reveal' ? 'Cards on the table.'
    : t.outcome === 'fold' ? 'A fold. The chamber waits.'
    : t.outcome === 'tie' ? 'A tie. Nobody shoots.'
    : t.shot ? (t.shot.fired ? (t.shot.seat === t.me ? 'The chamber was loaded.' : `${opp} is gone.`) : `${t.shot.seat === t.me ? 'Click. You live.' : `Click. ${opp} lives.`}${t.shot.forced ? ' (The Host pulled it.)' : ''}`) : '';
  return <div className="online-result" role="status">{text}</div>;
}

function Feeds({ view }: { view: RoomView }) {
  if (!view.feeds.length) return null;
  return <ul className="online-feeds">{view.feeds.map(f => <li key={f.id}>TABLE {f.id + 1} · {view.seats[f.seats[0]].name} vs {view.seats[f.seats[1]].name} · {f.phase === 'over' ? 'NO SIGNAL' : f.phase === 'shooting' ? `${view.seats[f.shooter!]?.name} HOLDS THE REVOLVER` : f.phase.toUpperCase()}</li>)}</ul>;
}
