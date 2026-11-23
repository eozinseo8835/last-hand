/**
 * Online mode: create or join a room with a code, wait in the lobby (up to 8 guests; empty seats get
 * computer guests), then play 1v1 tables through the 8 → 4 → 2 → 1 bracket in the same 3D room as story mode.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Users } from 'lucide-react';
import { tableAudio } from '../audio';
import type { useOnline } from './useOnline';
import { MAX_SEATS, type RoomView } from './protocol';

type OnlineApi = ReturnType<typeof useOnline>;
/**
 * Everything online that story mode does not have: finding or opening a room, the lobby, the room code,
 * and the banners between tables. The table itself is the story-mode HUD and scene (see useOnlineGame).
 */
export default function OnlineOverlay({ online, playerName, now, onExit }: { online: OnlineApi; playerName: string; now: number; onExit: () => void }) {
  const { view, status, error } = online;
  const [codeDraft, setCodeDraft] = useState('');
  useEffect(() => { tableAudio.init(); }, []);
  // Server messages ("Wait for the deal.") fade on their own.
  useEffect(() => { if (!error) return; const id = setTimeout(online.clearError, 3500); return () => clearTimeout(id); }, [error]);
  const leave = () => { online.leave(); onExit(); };
  const table = view?.table ?? null;
  const out = view?.stage === 'playing' && (!table || table.phase === 'over');
  return <>
    {(!view || status === 'idle') && status !== 'queue' && <OnlineStart status={status} codeDraft={codeDraft} setCodeDraft={setCodeDraft} onCreate={online.create} onJoin={() => online.join(codeDraft)} onFind={online.findMatch} onBack={leave} playerName={playerName}/>}
    {status === 'queue' && <div className="online-panel queue">
      <span className="small-label">FINDING GUESTS</span>
      <h2>{online.queue ? `${online.queue.players} waiting` : 'Joining the queue…'}</h2>
      <p className="queue-time">{online.queue ? `${Math.floor(Math.max(0, now - online.queue.since) / 1000)}s` : ''}</p>
      <p>When eight guests are waiting the game starts at once. With two or more, it starts after a short wait and computer guests take the empty seats.</p>
      {online.queue?.canStartAlone && <button className="primary-button sit-button" onClick={online.startNow}><span>Start with computer guests</span><ArrowRight size={18}/></button>}
      <button className="text-button" onClick={online.cancelQueue}><ArrowLeft size={14}/>Cancel</button>
    </div>}
    {view?.stage === 'lobby' && <OnlineLobby view={view} now={now} clockOffset={online.clockOffset} onStart={online.start} onLeave={leave}/>}
    {view && view.stage !== 'lobby' && <div className="online-code"><span className="rec-dot"/>LIVE · ROOM {view.code}{view.stage !== 'finished' && <button className="text-button" onClick={leave}><ArrowLeft size={12}/>Leave</button>}</div>}
    {out && view && <div className="online-banner">{view.seats[view.you]?.alive ? 'You survived this table. Waiting for the other tables…' : 'You are out. You are the audience now.'}<Feeds view={view}/></div>}
    {view?.stage === 'finished' && <div className="online-banner finished"><span className="small-label">THE LAST GUEST</span><h2>{view.winner !== null ? view.seats[view.winner].name : '—'}</h2>
      <p>{view.winner === view.you ? 'The door opens for you. The audience has voted.' : 'The door opens. Not for you.'}</p>
      <button className="primary-button" onClick={leave}>Back to menu</button></div>}
    {error && <div className="online-error" role="alert" onClick={online.clearError}>{error}</div>}
    {status === 'reconnecting' && <div className="online-error">Connection lost. Reconnecting…</div>}
    {view?.stage === 'lobby' && <button className="text-button online-leave" onClick={leave}><ArrowLeft size={14}/>Leave</button>}
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

function Feeds({ view }: { view: RoomView }) {
  if (!view.feeds.length) return null;
  return <ul className="online-feeds">{view.feeds.map(f => <li key={f.id}>TABLE {f.id + 1} · {view.seats[f.seats[0]].name} vs {view.seats[f.seats[1]].name} · {f.phase === 'over' ? 'NO SIGNAL' : f.phase === 'shooting' ? `${view.seats[f.shooter!]?.name} HOLDS THE REVOLVER` : f.phase.toUpperCase()}</li>)}</ul>;
}
