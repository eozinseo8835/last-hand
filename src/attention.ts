import type { RandomSource } from './game';
import { cosmeticRandom, type OpponentTell, type RoundEvent } from './tension';
import type { AmbientEvent, DistantShot } from './roomLife';

export type Glance = { start: number; end: number; direction: number };
export type AttentionPlan = { host: Glance[]; captive: Glance[] };
export type Gaze = { away: boolean; returning: boolean; amount: number; direction: number };
export type Attention = { host: Gaze; captive: Gaze; window: boolean };
const unit = (r: RandomSource) => Math.max(0, Math.min(.999999, r()));
/** Public, cosmetic timing; every round includes a readable shared distraction. */
export function planAttention(now: number, random: RandomSource = cosmeticRandom): AttentionPlan {
  const start = now + 2000 + unit(random) * 3500;
  const hostEnd = start + 2500 + unit(random) * 1500;
  const captiveStart = start + 150 + unit(random) * 200;
  const captiveEnd = captiveStart + 2000 + unit(random) * 1500;
  const captive = [{ start: captiveStart, end: captiveEnd, direction: 1 }];
  if (unit(random) < .6) { const next = now + 10000 + unit(random) * 6000; captive.push({ start: next, end: next + 1500 + unit(random) * 2000, direction: -1 }); }
  return { host: [{ start, end: hostEnd, direction: -1 }], captive };
}
const facing = (): Gaze => ({ away: false, returning: false, amount: 0, direction: 0 });
function gaze(glances: Glance[], now: number): Gaze {
  const glance = glances.find(g => now >= g.start && now < g.end);
  if (!glance) return facing();
  const remaining = glance.end - now;
  return { away: true, returning: remaining <= 400,
    amount: Math.min(1, (now - glance.start) / 220, remaining / 400), direction: glance.direction };
}
export function attentionAt(plan: AttentionPlan | null, now: number, events: {
  event?: RoundEvent | null; distantShot?: DistantShot | null; ambientEvent?: AmbientEvent | null; tell?: OpponentTell | null;
} = {}): Attention {
  const host = [...(plan?.host ?? [])], captive = [...(plan?.captive ?? [])];
  const add = (start: number, duration: number, direction: number, both: boolean) => {
    const glance = { start, end: start + duration, direction }; captive.unshift(glance); if (both) host.unshift(glance);
  };
  if (events.event) add(events.event.startedAt, events.event.duration, 1, events.event.kind !== 'tv');
  if (events.distantShot) add(events.distantShot.startedAt, events.distantShot.duration, events.distantShot.direction, true);
  if (events.ambientEvent) add(events.ambientEvent.startedAt, events.ambientEvent.duration, events.ambientEvent.direction, events.ambientEvent.loud);
  // A tell may distract the captive, but never turns the neutral Host.
  if (events.tell?.kind === 'avert') captive.push({ start: -Infinity, end: Infinity, direction: 1 });
  const h = gaze(host, now), c = gaze(captive, now);
  return { host: h, captive: c, window: h.away && c.away };
}
export function canOpponentPeek(attention: Attention, opponentInView: boolean): boolean {
  return attention.host.away && !opponentInView;
}
