import * as THREE from 'three';
import { createTensionRandom } from '../tension';
import { mergeStaticMeshes } from './merge';

export type MonitorState = {
  roomNumber?: 1 | 2 | 3;
  feedDeaths?: number[];
  feedDeathSerial?: number;
  phase?: string;
  storyStage?: string;
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

  function drawFeed(feed: Feed, table: number, time: number, hoodProgress: number) {
    const ctx = feed.context, deathAt = deathTimes.get(table);
    const deathAge = deathAt === undefined ? -1 : Math.max(0, time - deathAt);
    const flash = deathAge >= 0 && deathAge < .13;
    const slump = deathAge < 0 ? 0 : Math.min(1, deathAge / .6);
    const dark = deathAge >= .6;
    const random = createTensionRandom(table * 7907 + Math.floor(time * 10));
    ctx.fillStyle = '#0c1710'; ctx.fillRect(0, 0, 96, 72);
    ctx.fillStyle = '#1b2b20'; ctx.fillRect(7, 9, 82, 48);
    ctx.fillStyle = '#0d1c13'; ctx.fillRect(0, 56, 96, 16);
    // A fixed top-down-ish room composition, with the same lamp and two seats.
    ctx.fillStyle = '#59654b'; ctx.fillRect(47, 6, 2, 9);
    ctx.fillStyle = '#a1aa7c'; ctx.fillRect(43, 14, 10, 3);
    ctx.fillStyle = '#314b33'; ctx.beginPath(); ctx.ellipse(48, 47, 29, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b6249'; ctx.lineWidth = 1; ctx.stroke();
    const victim = table % 2;
    for (let seat = 0; seat < 2; seat++) {
      const x = seat ? 68 : 28, isVictim = deathAge >= 0 && seat === victim;
      const bob = isVictim ? 0 : Math.sin(time * 1.4 + table + seat) * .7;
      ctx.fillStyle = '#0b130f'; ctx.fillRect(x - 8, 27, 16, 27);
      ctx.fillStyle = isVictim && dark ? '#080e0a' : '#3c4b3c';
      const drop = isVictim ? slump * 15 : 0;
      ctx.fillRect(x - 6, 32 + drop * .5 + bob, 12 + drop * .15, 15 - drop * .35);
      ctx.fillStyle = isVictim && dark ? '#101810' : '#8a9273';
      ctx.fillRect(x - 4 + drop * .28, 24 + drop + bob, 8, 9 - drop * .15);
      if (hoodProgress < 1) {
        ctx.fillStyle = '#181d17'; ctx.fillRect(x - 5, 23 + drop + bob, 10, Math.max(1, 12 * (1 - hoodProgress)));
      }
      ctx.strokeStyle = isVictim && dark ? '#101a12' : '#687459';
      ctx.beginPath(); ctx.moveTo(x - 5, 39 + drop * .3); ctx.lineTo(42 + seat * 12, 45); ctx.stroke();
    }
    if (dark) {
      ctx.fillStyle = '#020603dd'; ctx.fillRect(victim ? 50 : 0, 20, 46, 38);
    }
    if (flash) {
      ctx.fillStyle = '#e5d9a0'; ctx.fillRect(victim ? 60 : 30, 36, 8, 8);
      ctx.fillStyle = '#bca16f99'; ctx.fillRect(7, 9, 82, 48);
    }
    for (let i = 0; i < 54; i++) {
      ctx.fillStyle = random() > .6 ? '#9aaa7c17' : '#000a071a';
      ctx.fillRect(Math.floor(random() * 96), Math.floor(random() * 72), 2, 1);
    }
    ctx.fillStyle = '#020604bb'; ctx.fillRect(0, 0, 96, 9); ctx.fillRect(0, 62, 96, 10);
    ctx.fillStyle = '#a6b89b'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`TABLE ${table}  •  LIVE`, 3, 7);
    const survivor = deathAge >= 0 && room === 1 && table === 3 ? 'GAMBLER' : deathAge >= 0 && room === 2 ? 'SURVIVOR' : 'GUESTS';
    ctx.fillText(survivor, 3, 69);
    feed.texture.needsUpdate = true;
    Object.assign(feed.screen.userData, { tableId: table, survivorLabel: survivor, status: flash ? 'flash' : dark ? 'seat-dark' : deathAge >= 0 ? 'slumping' : 'live', victimSeat: victim, hoodProgress, renderedAt: time });
  }

  configure();
  return {
    group,
    screens: feeds.map(feed => feed.screen),
    get signalTexture() { return signalTexture; },
    update(state: MonitorState, time: number) {
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
        for (let index = 0; index < feeds.length; index++) if (feeds[index].group.visible) drawFeed(feeds[index], room === 2 ? 2 : index + 2, time, hoodProgress);
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
