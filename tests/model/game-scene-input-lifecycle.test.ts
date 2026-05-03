import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_KEY_BINDINGS, normalizeKeyBindings } from "../../src/input/keybindings.ts";
import { PlayerControls } from "../../src/input/PlayerControls.ts";

type GameSceneConstructor = typeof import("../../src/GameScene.ts").GameScene;

const TEST_BINDINGS = normalizeKeyBindings({
  ...DEFAULT_KEY_BINDINGS,
  jump: ["KeyJ"],
  dash: ["KeyK"],
  crouchDash: ["KeyL"],
  confirm: ["Enter"],
  cancel: ["Escape"],
  pause: ["KeyP"],
});

let gameScenePromise: Promise<GameSceneConstructor> | null = null;

function phaserMock() {
  class Scene {}
  class Vector2 {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
  }
  class PostFXPipeline {}

  return {
    default: {
      Scene,
      WEBGL: "WEBGL",
      BlendModes: {
        ADD: "ADD",
      },
      Input: {
        Keyboard: {
          KeyCodes: {
            BACKTICK: 192,
          },
        },
      },
      Math: {
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
        Linear: (from: number, to: number, t: number) => from + (to - from) * t,
        Vector2,
        Easing: {
          Cubic: {
            Out: (t: number) => t,
          },
        },
      },
      Scenes: {
        Events: {
          SHUTDOWN: "shutdown",
        },
      },
      Renderer: {
        WebGL: {
          Pipelines: {
            PostFXPipeline,
          },
        },
      },
    },
  };
}

async function loadGameScene(): Promise<GameSceneConstructor> {
  if (gameScenePromise === null) {
    mock.module("phaser", phaserMock);
    gameScenePromise = import("../../src/GameScene.ts").then((module) => module.GameScene);
  }

  return gameScenePromise;
}

async function createSceneHarness(): Promise<InstanceType<GameSceneConstructor> & Record<string, unknown>> {
  const GameScene = await loadGameScene();
  const scene = Object.create(GameScene.prototype) as InstanceType<GameSceneConstructor> & Record<string, unknown>;

  scene.gameOptions = {
    keyboardBindings: TEST_BINDINGS,
    screenShakeEffects: true,
    dynamicHair: false,
    infiniteStamina: false,
    airDashes: "default",
    invincibility: false,
  };
  scene.controls = new PlayerControls();
  scene.heldKeyCodes = new Set<string>();
  scene.pressedKeyCodes = new Set<string>();
  scene.releasedKeyCodes = new Set<string>();
  scene.sampledGameplayHeldKeyCodes = new Set<string>();
  scene.pendingGameplayPressTimers = {
    jump: 0,
    dash: 0,
    crouchDash: 0,
  };
  scene.gameplayEdgesConsumed = false;
  scene.confirmBufferTimer = 0;
  scene.accumulator = 0;
  scene.simulationTime = 0;
  scene.fixedDt = 1 / 60;
  scene.maxSteps = 6;
  scene.game = { loop: { rawDelta: 16 } };
  scene.pauseMenu = { isOpen: false };
  scene.unpauseRecovery = { active: false };
  scene.pauseOverlay = { hide() {} };
  scene.player = {
    inControl: true,
    timePaused: false,
    canRetry: true,
    update() {},
    consumeFreezeRequest: () => 0,
    consumeEffects: () => [],
    getHurtboxBounds: () => ({ x: 0, y: 0, w: 8, h: 8 }),
    getSnapshot: () => ({ dead: false, state: "normal" }),
  };
  scene.playerView = {
    render() {},
    tick() {},
    advanceDeathRespawn() {},
    pauseEffects() {},
    resumeEffects() {},
  };
  scene.cameras = { main: {} };
  scene.roomTransition = null;
  scene.deathRespawnSequence = null;
  scene.freezeTimer = 0;
  scene.effectsPaused = false;
  scene.effectsPausedForPause = false;
  scene.effectsPausedForFreeze = false;
  scene.forceCameraUpdate = false;
  scene.displacement = { update() {} };
  scene.refillEmitter = { pause() {}, resume() {} };
  scene.renderLighting = () => {};
  scene.updateHUD = () => {};
  scene.renderDebugOverlay = () => {};
  scene.renderSpawnWipe = () => {};
  scene.clearSpawnWipe = () => {};
  scene.updateRoomTransition = () => {};
  scene.updateDeathRespawnSequence = () => {};
  scene.updateCamera = () => {};
  scene.renderPassiveFrame = () => {};
  return scene;
}

function keyDown(code: string): KeyboardEvent {
  return {
    code,
    repeat: false,
    preventDefault() {},
  } as KeyboardEvent;
}

function keyUp(code: string): KeyboardEvent {
  return {
    code,
    preventDefault() {},
  } as KeyboardEvent;
}

function installFixedStepGameplayStubs(scene: Record<string, unknown>) {
  let worldUpdates = 0;
  let playerUpdates = 0;

  const snapshot = {
    dead: false,
    state: "normal",
    vx: 0,
    vy: 0,
    top: 0,
    bottom: 8,
    left: 0,
    right: 8,
    centerX: 4,
    centerY: 4,
  };

  scene.world = {
    update() {
      worldUpdates++;
    },
    collidesWithSpike: () => null,
  };
  scene.player = {
    inControl: true,
    timePaused: false,
    canRetry: true,
    update() {
      playerUpdates++;
    },
    consumeFreezeRequest: () => 0,
    consumeEffects: () => [],
    getHurtboxBounds: () => ({ x: 0, y: 0, w: 8, h: 8 }),
    getSnapshot: () => snapshot,
  };
  scene.playerView = {
    render() {},
    tick() {},
    advanceDeathRespawn() {},
    pauseEffects() {},
    resumeEffects() {},
  };
  scene.updateRefills = () => 0;
  scene.enforceCurrentRoomTopLimit = () => {};
  scene.tryStartRoomTransition = () => false;
  scene.tryHandleBottomFallout = () => false;

  return {
    get playerUpdates() {
      return playerUpdates;
    },
    get worldUpdates() {
      return worldUpdates;
    },
  };
}

describe("GameScene input edge lifecycle", () => {
  test("gameplay ignores a complete press and release between fixed samples", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    (scene.onKeyUp as (event: KeyboardEvent) => void)(keyUp("KeyJ"));

    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeFalse();
    expect(input.jumpPressed).toBeFalse();
    expect(input.jumpReleased).toBeFalse();
  });

  test("held gameplay press sampled across a fixed step produces one press edge", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    const first = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    const second = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();

    expect(first.jump).toBeTrue();
    expect(first.jumpPressed).toBeTrue();
    expect(second.jump).toBeTrue();
    expect(second.jumpPressed).toBeFalse();
  });

  test("catch-up fixed steps do not repeat one sampled gameplay press", async () => {
    const scene = await createSceneHarness();
    installFixedStepGameplayStubs(scene);
    const inputs: ReturnType<PlayerControls["update"]>[] = [];
    (scene.player as { update: (dt: number, input: ReturnType<PlayerControls["update"]>) => void }).update = (
      _dt,
      input,
    ) => {
      inputs.push(input);
    };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 30;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 30);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].jumpPressed).toBeTrue();
    expect(inputs[1].jumpPressed).toBeFalse();
    expect(inputs[1].jump).toBeTrue();
  });

  test("fixed accumulator uses raw loop delta while presentation systems receive Phaser delta", async () => {
    const scene = await createSceneHarness();
    const counters = installFixedStepGameplayStubs(scene);
    let displacementDt = 0;
    scene.displacement = {
      update(dt: number) {
        displacementDt = dt;
      },
    };

    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 120;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 60);
    expect(displacementDt).toBeCloseTo(1 / 60, 5);
    expect(counters.playerUpdates).toBe(0);
    expect(counters.worldUpdates).toBe(0);

    (scene.update as (time: number, delta: number) => void)(1000 / 120, 1000 / 60);
    expect(counters.playerUpdates).toBe(1);
    expect(counters.worldUpdates).toBe(1);
  });

  test("room transitions preserve buffered gameplay presses while held", async () => {
    const scene = await createSceneHarness();
    installFixedStepGameplayStubs(scene);

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    scene.roomTransition = {};
    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 60;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 60);

    scene.roomTransition = null;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeTrue();
    expect(input.jumpPressed).toBeTrue();
    expect(input.jumpPressBufferTime).toBeGreaterThan(0);
    expect(input.jumpPressBufferTime).toBeLessThan(0.08);

    (scene.clearTransientKeyEdges as () => void)();
    const held = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(held.jump).toBeTrue();
    expect(held.jumpPressed).toBeFalse();
  });

  test("pause pressed during a room transition is consumed without opening the pause menu", async () => {
    const scene = await createSceneHarness();
    let openedPause = false;
    scene.openPauseMenu = () => {
      openedPause = true;
    };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyP"));
    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    scene.roomTransition = {};
    (scene.update as (time: number, delta: number) => void)(0, 16);

    expect(openedPause).toBeFalse();
    expect((scene.actionPressed as (action: string) => boolean)("pause")).toBeFalse();

    scene.roomTransition = null;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeTrue();
    expect(input.jumpPressed).toBeTrue();
  });

  test("freeze frames preserve buffered dash presses while held", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyK"));
    scene.freezeTimer = 0.05;
    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 60;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 60);

    scene.freezeTimer = 0;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.dash).toBeTrue();
    expect(input.dashPressed).toBeTrue();
    expect(input.dashPressBufferTime).toBeGreaterThan(0);
    expect(input.dashPressBufferTime).toBeLessThan(0.08);
  });

  test("freeze frames clear buffered gameplay presses after release", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyK"));
    scene.freezeTimer = 0.05;
    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 60;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 60);

    (scene.onKeyUp as (event: KeyboardEvent) => void)(keyUp("KeyK"));
    (scene.update as (time: number, delta: number) => void)(1000 / 60, 1000 / 60);

    scene.freezeTimer = 0;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.dash).toBeFalse();
    expect(input.dashPressed).toBeFalse();
  });

  test("player time-pause frames preserve buffered gameplay presses while held", async () => {
    const scene = await createSceneHarness();
    const player = scene.player as { timePaused: boolean };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    player.timePaused = true;
    (scene.game as { loop: { rawDelta: number } }).loop.rawDelta = 1000 / 60;
    (scene.update as (time: number, delta: number) => void)(0, 1000 / 60);

    player.timePaused = false;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeTrue();
    expect(input.jumpPressed).toBeTrue();
    expect(input.jumpPressBufferTime).toBeGreaterThan(0);
    expect(input.jumpPressBufferTime).toBeLessThan(0.08);
  });

  test("pause stays blocked through death and wipe until respawn starts", async () => {
    const scene = await createSceneHarness();
    let openedPause = false;
    scene.openPauseMenu = () => {
      openedPause = true;
    };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyP"));
    scene.deathRespawnSequence = {
      revealStarted: false,
      respawnStarted: false,
    };
    (scene.update as (time: number, delta: number) => void)(0, 16);

    expect(openedPause).toBeFalse();
    expect((scene.actionPressed as (action: string) => boolean)("pause")).toBeFalse();

    const player = scene.player as {
      timePaused: boolean;
      getSnapshot: () => { dead: boolean; state: string };
    };
    scene.deathRespawnSequence = {
      revealStarted: true,
      respawnStarted: true,
    };
    player.timePaused = true;
    player.getSnapshot = () => ({ dead: false, state: "intro_respawn" });

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyP"));
    (scene.update as (time: number, delta: number) => void)(0, 16);

    expect(openedPause).toBeTrue();
    expect((scene.actionPressed as (action: string) => boolean)("pause")).toBeFalse();
  });

  test("pause root disables retry when the player cannot retry", async () => {
    const scene = await createSceneHarness();
    const player = scene.player as { canRetry: boolean };
    player.canRetry = false;

    const root = (scene.createPauseRootMenu as () => { items: Array<{ label: string; disabled?: boolean }> })();
    expect(root.items.find((item) => item.label === "Retry")?.disabled).toBeTrue();
  });

  test("unpause recovery consumes held input separately and clears raw press edges", async () => {
    const scene = await createSceneHarness();
    let sampledHeld: { jump: boolean } | null = null;

    scene.unpauseRecovery = { active: true };
    scene.advanceUnpauseRecovery = function advanceUnpauseRecovery(this: Record<string, unknown>) {
      sampledHeld = (this.currentUnpauseRecoveryHeldState as () => { jump: boolean })();
      return true;
    };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    (scene.update as (time: number, delta: number) => void)(0, 16);

    expect(sampledHeld?.jump).toBeTrue();
    expect((scene.actionHeld as (action: string) => boolean)("jump")).toBeTrue();
    expect((scene.actionPressed as (action: string) => boolean)("jump")).toBeFalse();
  });
});
