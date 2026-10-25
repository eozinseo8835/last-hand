import { useEffect, useMemo, useRef, useState } from 'react';
import { tableAudio } from './audio';
import type { Speaker, VoiceProfile } from './campaign';
import type {TextSpeed} from './readability';
import { createVoicePlan } from './voice';

/** One timeline drives both subtitle letters and the mask's unintelligible voice. */
export default function Typewriter({ text, category = 'player_hits', danger = false, chambersFired = 0, speaker, profile, onFinish, onTyped, textSpeed = 'Normal', behind = false }: {
  text: string; category?: string; danger?: boolean; chambersFired?: number;
  speaker?: Speaker; profile?: VoiceProfile; onFinish?: () => void; onTyped?: (skipped:boolean) => void; textSpeed?:TextSpeed; behind?: boolean;
}) {
  const plan = useMemo(() => createVoicePlan(text, category, danger, chambersFired, profile, textSpeed),
    [text, category, danger, chambersFired, profile?.pitch, profile?.speed, profile?.wobble, profile?.calm,textSpeed]);
  const finishCallback = useRef(onFinish); finishCallback.current = onFinish;
  const skipped = useRef(false), completed=useRef(false),typedCallback=useRef(onTyped);typedCallback.current=onTyped;
  const [visible, setVisible] = useState({ text, count: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = visible.text === text ? visible.count : 0;

  useEffect(() => {
    setVisible({ text, count: 0 });
    skipped.current = false;completed.current=false;
    if (behind) tableAudio.startVoice(plan, speaker ?? 'captive', true);
    else if (speaker === undefined) tableAudio.startVoice(plan);
    else tableAudio.startVoice(plan, speaker);
    const started = performance.now();
    let index = 0;
    function schedule() {
      const step = plan.steps[index];
      if (!step) { timer.current = null; return; }
      timer.current = setTimeout(() => {
        setVisible({ text, count: step.count });
        index += 1;
        if(index===plan.steps.length){completed.current=true;typedCallback.current?.(false);}
        schedule();
      }, Math.max(0, step.at - (performance.now() - started)));
    }
    schedule();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      tableAudio.stopVoice();
    };
    // Position belongs to the start of this line; a story-stage change must not
    // restart its words or voice. New speech IDs remount the component in App.
  }, [text, plan, speaker]);

  function skip() {
    if(completed.current){if(!skipped.current){skipped.current=true;finishCallback.current?.();}return;}
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null; completed.current=true;
    tableAudio.stopVoice();setVisible({text,count:text.length});typedCallback.current?.(true);
  }

  return <button className="dialogue" onClick={skip} aria-label={`${text} Click to finish dialogue.`}>
    <span className="dialogue-quote">“</span><span>{text.slice(0, count)}<i className={count < text.length ? 'typing' : ''}/></span><span className="dialogue-skip">···</span>
  </button>;
}
