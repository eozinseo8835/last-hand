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
import { isHidden, MAX_SEATS, type RoomView } from './protocol';

const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const cardText = (c: Card) => `${c.rank}${SUIT[c.suit]}`;

export default function OnlineGame({ playerName, graphics, onExit }: { playerName: string; graphics: GraphicsMode; onExit: () => void }) {
  const online = useOnline(playerName);
  const { view, status, error } = online;
  const [codeDraft, setCodeDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [trigger, setTrigger] = useState<LocalTrigger>({ held: false, progress: 0, spinningUntil: 0, spinSerial: 0 });
  const holdStart = useRef<number | null>(null), pulled = useRef(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);
  useEffect(() => { tableAudio.init(); }, []);
  // Server messages ("Wait for the deal.") fade on their own.
  useEffect(() => { if (!error) return; const id = setTimeout(online.clearError, 3500); return () => clearTimeout(id); }, [error]);

  const table = view?.table ?? null;
  const shooting = table?.phase === 'shooting' && table.shooter === table.me;
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
  useEffect(() => { if (!shooting) { holdStart.current = null; pulled.current = false; setTrigger(t => ({ ...t, held: false, progress: 0 })); } }, [shooting, table?.round]);
  // Shot sounds come from the result the server sends.
  const lastShot = useRef<string>('');
  useEffect(() => {
    const shot = table?.shot; if (!shot) return;
    const key = `${table!.id}:${table!.round}:${shot.at}`; if (lastShot.current === key) return; lastShot.current = key;
    if (shot.fired) tableAudio.playShot({ id: key, kind: 'local', roomId: Math.min(3, view?.bracketRoom ?? 1) as 1 | 2 | 3 }); else tableAudio.play('click');
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
      {(!view || status === 'idle') && <OnlineStart status={status} codeDraft={codeDraft} setCodeDraft={setCodeDraft} onCreate={online.create} onJoin={() => online.join(codeDraft)} onBack={leave} playerName={playerName}/>}
      {view?.stage === 'lobby' && <OnlineLobby view={view} onStart={online.start} onLeave={leave}/>}
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
            <button className="secondary-button" disabled={table.spinUsed || trigger.held || now - (table.phaseStartedAt - online.clockOffset) < 1500}
              onClick={() => { online.act('spin'); setTrigger(t => ({ ...t, spinningUntil: Date.now() + 1400, spinSerial: t.spinSerial + 1 })); }}>SPIN CYLINDER</button>
            <HoldTrigger progress={trigger.progress} holding={trigger.held} disabled={now < trigger.spinningUntil || now - (table.phaseStartedAt - online.clockOffset) < 1500}
              onHold={() => { holdStart.current = Date.now(); pulled.current = false; setTrigger(t => ({ ...t, held: true })); }}
              onRelease={() => { if (!pulled.current) setTrigger(t => ({ ...t, held: false, progress: 0 })); }}/>
          </>}
          {table.phase === 'shooting' && !shooting && <span className="online-wait">{opponentName} holds the revolver…</span>}
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

function OnlineStart({ status, codeDraft, setCodeDraft, onCreate, onJoin, onBack, playerName }: {
  status: string; codeDraft: string; setCodeDraft: (v: string) => void; onCreate: () => void; onJoin: () => void; onBack: () => void; playerName: string;
}) {
  const busy = status === 'connecting';
  return <div className="online-panel">
    <span className="small-label">ONLINE · UP TO 8 GUESTS</span>
    <h2>Private table</h2>
    <p>Playing as <b>{playerName}</b>. Make a room and share its code, or enter a friend's code.</p>
    <button className="primary-button sit-button" disabled={busy} onClick={onCreate}><span>{busy ? 'Opening…' : 'Create room'}</span><ArrowRight size={18}/></button>
    <form className="join-row" onSubmit={e => { e.preventDefault(); onJoin(); }}>
      <input aria-label="Room code" placeholder="CODE" maxLength={4} value={codeDraft} onChange={e => setCodeDraft(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false}/>
      <button className="secondary-button" type="submit" disabled={busy || codeDraft.length < 4}>Join</button>
    </form>
    <button className="text-button" onClick={onBack}><ArrowLeft size={14}/>Back</button>
  </div>;
}

function OnlineLobby({ view, onStart, onLeave }: { view: RoomView; onStart: () => void; onLeave: () => void }) {
  const isHost = view.seats[view.you]?.host, humans = view.seats.filter(s => s.kind === 'human').length;
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
    {isHost ? <button className="primary-button sit-button" onClick={onStart}><span>Start the game</span><ArrowRight size={18}/></button> : <p className="lobby-note">Waiting for the host to start…</p>}
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
