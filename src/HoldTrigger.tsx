import { useEffect, useRef } from 'react';
import { Crosshair } from 'lucide-react';
import { CONFIG } from './game';

/** Releasing, losing capture, or leaving the page always cancels the same hold. */
export default function HoldTrigger({ progress, holding, disabled, onHold, onRelease }: {
  progress: number; holding: boolean; disabled: boolean;
  onHold: () => void; onRelease: () => void;
}) {
  const input = useRef<'pointer' | 'keyboard' | null>(null);
  const releaseAction = useRef(onRelease);
  releaseAction.current = onRelease;
  const value = Math.max(0, Math.min(1, progress));
  function release() {
    if (input.current === null) return;
    input.current = null;
    releaseAction.current();
  }
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
      release();
    };
  }, []);
  useEffect(() => { if (disabled) release(); }, [disabled]);
  return <button className={`primary-button trigger-button hold-trigger ${holding ? 'is-holding' : ''}`}
    disabled={disabled} aria-label="HOLD TO PULL" aria-pressed={holding}
    title={`Hold continuously for ${CONFIG.TRIGGER_HOLD_MS / 1000} seconds. Release to cancel.`}
    onPointerDown={event => {
      if (event.button !== 0 || event.isPrimary === false || disabled || input.current !== null) return;
      event.preventDefault(); event.currentTarget.focus();
      input.current = 'pointer';
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Capture can be unavailable on a canceled pointer. */ }
      onHold();
    }}
    onPointerUp={() => { if (input.current === 'pointer') release(); }}
    onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      if (disabled || input.current !== null || event.repeat) return;
      input.current = 'keyboard'; onHold();
    }}
    onKeyUp={event => {
      if ((event.code === 'Space' || event.code === 'Enter') && input.current === 'keyboard') {
        event.preventDefault(); release();
      }
    }}>
    <span className="trigger-ring" role="progressbar" aria-label="Trigger pull progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <svg viewBox="0 0 42 42" aria-hidden="true"><circle className="ring-track" cx="21" cy="21" r="18"/><circle className="ring-progress" cx="21" cy="21" r="18" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - value)}/></svg>
      <Crosshair size={15}/>
    </span>
    <span>HOLD TO PULL</span>
  </button>;
}
