import * as THREE from 'three';
import { createTensionRandom } from '../tension';
import { mergeStaticMeshes } from './merge';
import { cinematicProgress, type CinematicState } from '../cinematics';
import { monitorActivityAt } from '../roomLife';

export type MonitorState = {
  roomNumber?: 1 | 2 | 3;
  feedDeaths?: number[];
  feedDeathSerial?: number;
  phase?: string;
  storyStage?: string;
  cinematic?: CinematicState | null;
  tiesCut?: { player: boolean; ai: boolean };
};

type Feed = {
  group: THREE.Group;
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
};

/** One real overhead render is shared by every surveillance screen at 10 Hz. */
export function createCeilingFeed(scene: THREE.Scene, screenGroup: THREE.Group) {
  const camera = new THREE.PerspectiveCamera(72, 4 / 3, .06, 25);
  // A corner ceiling camera can see every seat without looking through the
  // hanging lampshade directly above the table.
  camera.name = 'surveillance-ceiling-camera'; camera.position.set(1.75, 3.65, 1.65);
  camera.up.set(0, 0, -1); camera.lookAt(-.2, .85, .15);
  camera.layers.enable(1); scene.add(camera);
  const target = new THREE.WebGLRenderTarget(96, 72, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  let nextFrame = 0, frameCount = 0, disposed = false;
  return {
    camera,
    target,
    get frames() { return frameCount; },
    render(renderer: Pick<THREE.WebGLRenderer, 'setRenderTarget' | 'getRenderTarget' | 'render'>, time: number, enabled: boolean) {
      if (disposed || !enabled || time + .000001 < nextFrame) return false;
      // Advance from the current time; waking a background tab never creates a backlog.
      nextFrame = time + .1;
      const previousTarget = renderer.getRenderTarget(), previousVisibility = screenGroup.visible;
      screenGroup.visible = false;
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        frameCount++;
      } finally {
        screenGroup.visible = previousVisibility;
        renderer.setRenderTarget(previousTarget);
      }
      return true;
    },
    reset() { nextFrame = 0; frameCount = 0; },
    dispose() {
      if (disposed) return;
      disposed = true; camera.removeFromParent(); target.dispose();
    },
  };
}

/** The other tables are small generated feeds. The final room gets a real scene texture. */
export function createMonitorWall(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'campaign-monitor-wall'; group.position.z = -3.96; scene.add(group);
  const casing = new THREE.MeshStandardMaterial({ color: 0x30392d, roughness: .92, metalness: .2, flatShading: true });
  const rim = new THREE.MeshStandardMaterial({ color: 0x131d18, roughness: .88, metalness: .3, flatShading: true });
  const feeds: Feed[] = [];
  const geometry = new Set<THREE.BufferGeometry>();
  for (let index = 0; index < 3; index++) {
    const tv = new THREE.Group(); tv.name = `wall-crt-${index + 1}`; tv.position.set((index - 1) * 1.3, 2.45, 0); group.add(tv);
    const box = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material); mesh.position.set(x, y, z); tv.add(mesh); return mesh;
    };
    box(1.06, .83, .19, 0, 0, 0, casing);
    box(.99, .74, .025, 0, 0, .106, rim);
    box(.045, .27, .035, .455, -.025, .132, casing);
    box(.08, .045, .035, .425, -.27, .132, casing);
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 72;
    const context = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xa2ba9b, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.81, .608), material); screen.name = `monitor-feed-${index + 1}`;
    screen.position.set(-.035, .005, .126); tv.add(screen);
    mergeStaticMeshes(tv, mesh => mesh !== screen);
    tv.traverse(object => { if (object instanceof THREE.Mesh) geometry.add(object.geometry); });
    feeds.push({ group: tv, screen, canvas, context, texture });
  }
  const signalCanvas = document.createElement('canvas'); signalCanvas.width = 96; signalCanvas.height = 72;
  const signalContext = signalCanvas.getContext('2d')!;
  signalContext.fillStyle = '#030805'; signalContext.fillRect(0, 0, 96, 72);
  signalContext.fillStyle = '#9aae98'; signalContext.font = 'bold 9px monospace'; signalContext.textAlign = 'center';
  signalContext.fillText('NO SIGNAL', 48, 38);
  const signalTexture = new THREE.CanvasTexture(signalCanvas); signalTexture.colorSpace = THREE.SRGBColorSpace;
  signalTexture.minFilter = signalTexture.magFilter = THREE.NearestFilter; signalTexture.generateMipmaps = false;
  let room: 1 | 2 | 3 = 1, previousPhase = '', previousStoryStage = '', openingStartedAt = 0, unhoodStartedAt = 0, nextFrame = -Infinity;
  let ceilingTexture: THREE.Texture | null = null, signalLost = false, disposed = false, redraws = 0;
  const deathTimes = new Map<number, number>();

  function configure() {
    for (let index = 0; index < feeds.length; index++) {
      const feed = feeds[index];
      feed.group.visible = room !== 2 || index === 1;
      feed.screen.material.map = room === 3 ? signalLost ? signalTexture : ceilingTexture ?? feed.texture : feed.texture;
      feed.screen.material.needsUpdate = true;
    }
    group.userData.roomNumber = room;
    group.userData.feedCount = room === 2 ? 1 : 3;
    group.userData.mode = room === 3 ? signalLost ? 'no-signal' : 'ceiling' : 'simulated';
  }

  function drawFeed(feed: Feed, table: number, time: number, hoods: [number, number], state: MonitorState, now: number) {
    const ctx = feed.context, deathAt = deathTimes.get(table);
    const deathAge = deathAt === undefined ? -1 : Math.max(0, time - deathAt);
    const flash = deathAge >= 0 && deathAge < .13;
    const slump = deathAge < 0 ? 0 : Math.min(1, deathAge / .6), dark = deathAge >= .6;
    const random = createTensionRandom(table * 7907 + Math.floor(time * 10));
    const cinematic = state.cinematic, stage = cinematic?.stage;
    const progress = cinematicProgress(cinematic, now);
    const opening = !!cinematic && cinematic.mode !== 'transfer' && stage !== 'complete';
    const activity = monitorActivityAt(table, time);
    const action = opening ? 'waiting' : activity.kind;
    const actionSeat = deathAge >= 0 ? 1 - table % 2 : (activity.serial + table) % 2;
    const active = Math.sin(activity.progress * Math.PI), victim = table % 2;
    const tied = state.tiesCut ?? { player: false, ai: false };
    const captiveTies = cinematic ? [!tied.player, !tied.ai] : [false, false];
    const warm = room === 2;
    ctx.fillStyle = warm ? '#1a0d0b' : '#0c1710'; ctx.fillRect(0, 0, 96, 72);
    ctx.fillStyle = warm ? '#36231c' : '#1b2b20'; ctx.fillRect(7, 9, 82, 48);
    ctx.fillStyle = '#0d1510'; ctx.fillRect(0, 56, 96, 16);
    // Three distinct people: an identical masked Host at the left table end,
    // and two seated captives. All motion is generated into this one tiny map.
    ctx.fillStyle = '#59654b'; ctx.fillRect(47, 6, 2, 9);
    ctx.fillStyle = warm ? '#b68965' : '#a1aa7c'; ctx.fillRect(43, 14, 10, 3);
    ctx.fillStyle = warm ? '#4d3527' : '#314b33'; ctx.beginPath(); ctx.ellipse(49, 48, 31, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b6249'; ctx.lineWidth = 1; ctx.stroke();
    // The deck remains by the Host; dealt cards travel across the felt.
    ctx.fillStyle = '#a6a286'; ctx.fillRect(21, 44, 7, 5);
    ctx.fillStyle = '#17271c'; ctx.fillRect(21, 43, 7, 4);
    const dealing = !opening && deathAge < 0 && action === 'deal';
    const deal = activity.progress, receiving = Math.floor(deal * 4) % 2;
    const slide = (deal * 4) % 1, cardX = 25 + (receiving ? 37 : 15) * slide;
    if (dealing) {
      ctx.fillStyle = '#d7d0a4'; ctx.fillRect(cardX, 45 + Math.sin(slide * Math.PI), 5, 7);
      ctx.fillStyle = receiving ? '#732b24' : '#1c251b'; ctx.fillRect(cardX + 1, 46, 1, 2);
    }
    for (const [x, red] of [[40, false], [60, true]] as const) {
      ctx.fillStyle = '#bcb791'; ctx.fillRect(x, 48, 5, 7);
      ctx.fillStyle = red ? '#782d27' : '#273326'; ctx.fillRect(x + 1, 49, 1, 2);
    }
    const hostCuts = stage === 'cut-player' || stage === 'cut-opponent';
    const hostArmX = hostCuts ? stage === 'cut-player' ? 37 : 64 : dealing ? 26 : 20;
    const hostArmY = hostCuts ? 43 : dealing ? 44 : 40;
    ctx.fillStyle = '#101a15'; ctx.fillRect(8, 32, 10, 16); ctx.fillRect(8, 47, 4, 10); ctx.fillRect(14, 47, 4, 10);
    ctx.fillStyle = '#d3ceb2'; ctx.fillRect(10, 23, 6, 9); // Pale, featureless mask.
    ctx.fillStyle = '#abb090'; ctx.fillRect(12, 34, 2, 7);
    ctx.strokeStyle = '#4d5948'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(17, 35); ctx.lineTo(20, 40); ctx.lineTo(hostArmX, hostArmY); ctx.stroke();
    ctx.fillStyle = '#8c987a'; ctx.fillRect(hostArmX - 1, hostArmY - 1, 3, 3);
    if (hostCuts) {
      ctx.strokeStyle = '#d1d2bc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hostArmX, hostArmY); ctx.lineTo(hostArmX + 4, hostArmY - 2); ctx.stroke();
    }
    for (let seat = 0; seat < 2; seat++) {
      const x = seat ? 68 : 36, isVictim = deathAge >= 0 && seat === victim;
      const reacting = !isVictim && seat === actionSeat;
      const flinch = reacting && action === 'flinch' ? active : 0;
      const conceal = reacting && action === 'hide' ? active : 0;
      const bob = isVictim ? 0 : Math.sin(time * 1.4 + table + seat) * .5;
      const drop = isVictim ? slump * 15 : conceal * 3;
      const tugged = !isVictim && ((stage === 'player-unhood' && seat === 0) || (stage === 'opponent-unhood' && seat === 1));
      const headX = x + (isVictim ? drop * .28 : flinch * 3), headY = 25 + drop + bob - flinch * 3 - (tugged ? Math.sin(progress * Math.PI) * 2 : 0);
      ctx.fillStyle = '#0b130f'; ctx.fillRect(x - 8, 29, 16, 27);
      ctx.fillStyle = isVictim && dark ? '#080e0a' : warm ? '#705240' : '#3c4b3c';
      ctx.fillRect(x - 6 + flinch, 33 + drop * .5 + bob, 12 + drop * .15, 15 - drop * .35);
      ctx.fillStyle = isVictim && dark ? '#101810' : warm ? '#b08c68' : '#8a9273';
      ctx.fillRect(headX - 4, headY, 8, 9 - drop * .15);
      const hoodProgress = hoods[seat];
      if (hoodProgress < 1 && !isVictim) {
        ctx.fillStyle = '#181d17'; ctx.fillRect(headX - 5, headY - 1 - hoodProgress * 5, 10, Math.max(1, 12 * (1 - hoodProgress)));
        ctx.strokeStyle = '#52604a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(headX - 5, headY + 9 - hoodProgress * 7); ctx.lineTo(headX + 5, headY + 9 - hoodProgress * 7); ctx.stroke();
      }
      // Bent arms make the large gestures legible even at 96 by 72 pixels.
      let leftX = x - 4, rightX = x + 5, handY = 45, elbowY = 40;
      if (reacting && action === 'beg') { leftX = x - 9; rightX = x + 9; handY = 24 - active * 5; elbowY = 35; }
      else if (conceal > 0) { leftX = headX - 3; rightX = headX + 3; handY = headY + 6; elbowY = 41; }
      else if (reacting && action === 'slam') { rightX = x - (seat ? 7 : -7); handY = activity.progress < .4 ? 35 - active * 10 : 47; }
      else if (dealing && receiving === seat) { rightX = x + (seat ? -1 : 1) * Math.sin(slide * Math.PI) * 9; handY = 44; }
      if (captiveTies[seat]) { leftX = x - 2; rightX = x + 2; handY = 44; }
      ctx.strokeStyle = isVictim && dark ? '#101a12' : '#687459'; ctx.lineWidth = 2;
      for (const [shoulder, hand] of [[x - 5, leftX], [x + 5, rightX]]) {
        ctx.beginPath(); ctx.moveTo(shoulder, 36 + drop * .3); ctx.lineTo(shoulder + (hand < shoulder ? -2 : 2), elbowY); ctx.lineTo(hand, handY + drop * .2); ctx.stroke();
      }
      if (!isVictim) {
        ctx.fillStyle = warm ? '#b08c68' : '#a0a78a'; ctx.fillRect(leftX - 1, handY - 1, 3, 3); ctx.fillRect(rightX - 1, handY - 1, 3, 3);
        if (captiveTies[seat]) { ctx.fillStyle = '#c5c5ac'; ctx.fillRect(x - 4, 44, 8, 1); }
      }
    }
    const guardVisible = opening && ['door-open', 'guard-approach', 'player-unhood', 'player-focus', 'opponent-unhood', 'guard-exit'].includes(stage ?? '');
    if (guardVisible) {
      ctx.fillStyle = '#090e0a'; ctx.fillRect(86, 12, 9, 44);
      ctx.fillStyle = '#4a5848'; ctx.fillRect(85, 12, 1, 44);
      const guardX = stage === 'door-open' ? 86 : stage === 'guard-approach' ? 86 - progress * 50 : stage === 'player-unhood' ? 36
        : stage === 'player-focus' ? 36 + progress * 32 : stage === 'opponent-unhood' ? 68 : 68 + progress * 21;
      ctx.fillStyle = '#101513'; ctx.fillRect(guardX - 4, 21, 9, 22); ctx.fillRect(guardX - 4, 42, 4, 13); ctx.fillRect(guardX + 1, 42, 4, 13);
      ctx.fillStyle = '#080b09'; ctx.fillRect(guardX - 3, 14, 7, 8);
      ctx.fillStyle = '#7b8271'; ctx.fillRect(guardX - 2, 17, 5, 1);
      if (stage === 'player-unhood' || stage === 'opponent-unhood') {
        const targetX = stage === 'player-unhood' ? 36 : 68;
        ctx.strokeStyle = '#242f26'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(guardX + 3, 24); ctx.lineTo(targetX + 4, 21 - progress * 9); ctx.stroke();
        ctx.fillStyle = '#111813'; ctx.fillRect(targetX - 5, 20 - progress * 10, 10, 8 * (1 - progress));
      }
      if (stage === 'guard-exit') { ctx.fillStyle = '#1a231a'; ctx.fillRect(guardX - 5, 32, 5, 7); ctx.fillRect(guardX + 1, 33, 5, 6); }
    }
    if (dark) { ctx.fillStyle = '#020603dd'; ctx.fillRect(victim ? 50 : 0, 20, 46, 39); }
    if (flash) {
      ctx.fillStyle = '#e5d9a0'; ctx.fillRect(victim ? 61 : 39, 38, 8, 8);
      ctx.fillStyle = '#bca16f99'; ctx.fillRect(7, 9, 82, 48);
    }
    for (let i = 0; i < 54; i++) {
      ctx.fillStyle = random() > .6 ? '#9aaa7c17' : '#000a071a';
      ctx.fillRect(Math.floor(random() * 96), Math.floor(random() * 72), 2, 1);
    }
    const glitch = action === 'glitch' && (Math.floor(activity.progress * 24) % 5 < 2);
    if (glitch) {
      for (let row = 12; row < 61; row += 5) {
        ctx.fillStyle = random() > .5 ? '#b4c2a37a' : '#020803bb'; ctx.fillRect(0, row, 96, 1 + Math.floor(random() * 3));
      }
      ctx.fillStyle = '#16251ccc'; ctx.fillRect(20, 24 + random() * 18, 70, 5);
    }
    ctx.fillStyle = '#020604bb'; ctx.fillRect(0, 0, 96, 9); ctx.fillRect(0, 62, 96, 10);
    ctx.fillStyle = '#a6b89b'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`TABLE ${table}  •  LIVE`, 3, 7);
    const survivor = deathAge >= 0 && room === 1 && table === 3 ? 'GAMBLER' : deathAge >= 0 && room === 2 ? 'SURVIVOR' : 'GUESTS';
    ctx.fillText(survivor, 3, 69);
    if (!opening && deathAge < 0 && action !== 'deal') { ctx.textAlign = 'right'; ctx.fillText(action.toUpperCase(), 93, 69); }
    feed.texture.needsUpdate = true;
    Object.assign(feed.screen.userData, { tableId: table, survivorLabel: survivor, status: flash ? 'flash' : dark ? 'seat-dark' : deathAge >= 0 ? 'slumping' : 'live',
      victimSeat: victim, hoodProgress: Math.min(...hoods), playerHoodProgress: hoods[0], opponentHoodProgress: hoods[1],
      renderedAt: time, hostVisible: true, hostMasked: true, captiveCount: 2, hostAction: hostCuts ? 'cut-ties' : dealing ? 'deal' : 'watch',
      activity: opening ? 'opening' : action, activitySerial: activity.serial, activityProgress: activity.progress, glitch,
      guardVisible, playerTied: captiveTies[0], opponentTied: captiveTies[1] });
  }

  configure();
  return {
    group,
    screens: feeds.map(feed => feed.screen),
    get signalTexture() { return signalTexture; },
    update(state: MonitorState, time: number, now = Date.now()) {
      if (disposed) return;
      const nextRoom = state.roomNumber ?? 1;
      if (nextRoom !== room) {
        room = nextRoom; deathTimes.clear(); signalLost = false; nextFrame = -Infinity; configure();
      }
      if (state.phase === 'OPENING' && previousPhase !== 'OPENING') openingStartedAt = time;
      if (state.storyStage === 'unhood' && previousStoryStage !== 'unhood') unhoodStartedAt = time;
      previousPhase = state.phase ?? '';
      previousStoryStage = state.storyStage ?? '';
      for (const table of state.feedDeaths ?? []) if (!deathTimes.has(table)) deathTimes.set(table, time);
      if (time + .000001 < nextFrame) return;
      nextFrame = time + .1;
      if (room === 3) {
        for (const feed of feeds) Object.assign(feed.screen.userData, { tableId: 1, status: signalLost ? 'no-signal' : 'ceiling', renderedAt: time });
      } else {
        const hoodProgress = state.phase !== 'OPENING' || state.storyStage === 'rules' ? 1
          : state.storyStage === 'hooded' ? 0
          : state.storyStage === 'unhood' ? Math.min(1, Math.max(0, (time - unhoodStartedAt) / .8))
          : Math.min(1, Math.max(0, time - openingStartedAt));
        let hoods: [number, number] = [hoodProgress, hoodProgress];
        const cinematic = state.cinematic;
        if (cinematic) {
          const stage = cinematic.stage, progress = cinematicProgress(cinematic, now);
          if (['hooded', 'door-open', 'guard-approach'].includes(stage)) hoods = [0, 0];
          else if (stage === 'player-unhood') hoods = [progress, 0];
          else if (stage === 'player-focus') hoods = [1, 0];
          else if (stage === 'opponent-unhood') hoods = [1, progress];
          else if (stage === 'transfer-hood') hoods = [1 - progress, 1 - progress];
          else if (['lift', 'dragging', 'door'].includes(stage)) hoods = [0, 0];
          else hoods = [1, 1];
        }
        for (let index = 0; index < feeds.length; index++) if (feeds[index].group.visible) drawFeed(feeds[index], room === 2 ? 2 : index + 2, time, hoods, state, now);
      }
      group.userData.renderCount = ++redraws; group.userData.renderedAt = time;
    },
    setCeilingTexture(texture: THREE.Texture) {
      if (disposed || ceilingTexture === texture) return;
      ceilingTexture = texture; configure();
    },
    setSignalLost(value: boolean) {
      if (disposed || value === signalLost) return;
      signalLost = value; configure();
    },
    reset() {
      room = 1; previousPhase = ''; previousStoryStage = ''; openingStartedAt = unhoodStartedAt = 0; signalLost = false; nextFrame = -Infinity; redraws = 0; deathTimes.clear();
      for (const feed of feeds) feed.screen.userData = {};
      configure(); group.userData.renderCount = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); geometry.forEach(item => item.dispose());
      casing.dispose(); rim.dispose(); signalTexture.dispose();
      for (const feed of feeds) { feed.screen.material.dispose(); feed.texture.dispose(); }
    },
  };
}
