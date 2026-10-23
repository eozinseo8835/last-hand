import { useEffect, useMemo, useRef, useState } from 'react';
import { tableAudio } from './audio';
import type { DialogueCategory } from './dialogue';
import { createVoicePlan } from './voice';

/** One timeline drives both subtitle letters and the mask's unintelligible voice. */
export default function Typewriter({ text, category = 'player_hits', danger = false }: {
  text: string; category?: DialogueCategory; danger?: boolean;
}) {
  const plan = useMemo(() => createVoicePlan(text, category, danger), [text, category, danger]);
  const [visible, setVisible] = useState({ text, count: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = visible.text === text ? visible.count : 0;

  useEffect(() => {
    setVisible({ text, count: 0 });
    tableAudio.startVoice(plan);
    const started = performance.now();
    let index = 0;
    function schedule() {
      const step = plan.steps[index];
      if (!step) { timer.current = null; return; }
      timer.current = setTimeout(() => {
        setVisible({ text, count: step.count });
        index += 1;
        schedule();
      }, Math.max(0, step.at - (performance.now() - started)));
    }
    schedule();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      tableAudio.stopVoice();
    };
  }, [text, plan]);

  function skip() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    tableAudio.stopVoice();
    setVisible({ text, count: text.length });
  }

  return <button className="dialogue" onClick={skip} aria-label={`${text} Click to finish dialogue.`}>
    <span className="dialogue-quote">“</span><span>{text.slice(0, count)}<i className={count < text.length ? 'typing' : ''}/></span><span className="dialogue-skip">···</span>
  </button>;
}
