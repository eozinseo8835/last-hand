// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HoldTrigger from './HoldTrigger';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement, root: Root, mounted: boolean;
let onHold: ReturnType<typeof vi.fn>, onRelease: ReturnType<typeof vi.fn>;
function button() { return container.querySelector<HTMLButtonElement>('.hold-trigger')!; }
function render(progress = 0, holding = false, disabled = false, release = onRelease) {
  act(() => root.render(<HoldTrigger progress={progress} holding={holding} disabled={disabled} onHold={onHold} onRelease={release}/>));
}
function pointer(type: string, options: { button?: number; isPrimary?: boolean; pointerId?: number } = {}) {
  // React's pointer handlers only need these fields; jsdom may not implement PointerEvent.
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: options.button ?? 0 });
  Object.defineProperties(event, {
    isPrimary: { value: options.isPrimary ?? true }, pointerId: { value: options.pointerId ?? 1 },
  });
  act(() => button().dispatchEvent(event));
}
function key(type: string, code: string, repeat = false) {
  act(() => button().dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true })));
}

beforeEach(() => {
  onHold = vi.fn(); onRelease = vi.fn();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove(); vi.restoreAllMocks();
});

describe('hold-to-pull input safety', () => {
  it('a click alone cannot begin a hold or pull a trigger', () => {
    render();
    act(() => button().click());
    expect(onHold).not.toHaveBeenCalled(); expect(onRelease).not.toHaveBeenCalled();
  });

  it('begins once on the primary pointer and releases once on pointer-up', () => {
    render();
    const capture = vi.fn(); button().setPointerCapture = capture;
    pointer('pointerdown'); pointer('pointerdown');
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled(); expect(capture).toHaveBeenCalledWith(1);
    pointer('pointerup'); pointer('pointercancel'); pointer('lostpointercapture');
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('ignores right-clicks and secondary touch pointers', () => {
    render();
    pointer('pointerdown', { button: 2 });
    pointer('pointerdown', { isPrimary: false, pointerId: 2 });
    pointer('pointerup');
    expect(onHold).not.toHaveBeenCalled(); expect(onRelease).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'lostpointercapture', 'button blur', 'window blur', 'hidden page', 'disabled', 'unmount'] as const)(
    '%s cancels an active hold exactly once', reason => {
      render(); pointer('pointerdown'); expect(onHold).toHaveBeenCalledTimes(1);
      if (reason === 'pointercancel' || reason === 'lostpointercapture') pointer(reason);
      else if (reason === 'button blur') act(() => button().blur());
      else if (reason === 'window blur') act(() => window.dispatchEvent(new Event('blur')));
      else if (reason === 'hidden page') {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      } else if (reason === 'disabled') render(.4, true, true);
      else { act(() => root.unmount()); mounted = false; }
      expect(onRelease).toHaveBeenCalledTimes(1);
      act(() => window.dispatchEvent(new Event('blur')));
      if (mounted) { pointer('pointerup'); pointer('lostpointercapture'); }
      expect(onRelease).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['Space', 'Enter'])('%s provides a keyboard hold until key-up without repeat restarts', code => {
    render(); act(() => button().focus());
    key('keydown', code);
    key('keydown', code, true);
    key('keydown', code);
    expect(onHold).toHaveBeenCalledTimes(1); expect(onRelease).not.toHaveBeenCalled();
    key('keyup', 'KeyA'); expect(onRelease).not.toHaveBeenCalled();
    key('keyup', code); key('keyup', code);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeated key-down if its original press did not begin on this button', () => {
    render();
    key('keydown', 'Space', true); key('keyup', 'Space');
    expect(onHold).not.toHaveBeenCalled(); expect(onRelease).not.toHaveBeenCalled();
  });

  it('a disabled trigger cannot begin either a pointer or keyboard hold', () => {
    render(0, false, true);
    pointer('pointerdown'); key('keydown', 'Space'); key('keydown', 'Enter');
    act(() => button().click());
    expect(button().disabled).toBe(true);
    expect(onHold).not.toHaveBeenCalled(); expect(onRelease).not.toHaveBeenCalled();
  });

  it('progress updates preserve the active input and use the newest release callback', () => {
    render(); pointer('pointerdown');
    const latestRelease = vi.fn();
    render(.33, true, false, latestRelease);
    render(.66, true, false, latestRelease);
    expect(onHold).toHaveBeenCalledTimes(1); expect(onRelease).not.toHaveBeenCalled();
    expect(latestRelease).not.toHaveBeenCalled();
    const ring = container.querySelector('[role="progressbar"]')!;
    expect(ring.getAttribute('aria-label')).toBe('Trigger pull progress');
    expect(ring.getAttribute('aria-valuemin')).toBe('0'); expect(ring.getAttribute('aria-valuemax')).toBe('100');
    expect(ring.getAttribute('aria-valuenow')).toBe('66'); expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.ring-progress')?.getAttribute('stroke-dashoffset')).toBe('34');
    pointer('pointerup');
    expect(onRelease).not.toHaveBeenCalled(); expect(latestRelease).toHaveBeenCalledTimes(1);
  });
});
