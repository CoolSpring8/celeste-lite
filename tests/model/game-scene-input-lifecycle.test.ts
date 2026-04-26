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
  scene.gameplayEdgesConsumed = false;
  scene.confirmBufferedFrames = 0;
  scene.pauseMenu = { isOpen: false };
  scene.unpauseRecovery = { active: false };
  scene.pauseOverlay = { hide() {} };
  scene.player = {
    inControl: true,
    timePaused: false,
    getSnapshot: () => ({}),
  };
  scene.playerView = {
    render() {},
    advanceDeathRespawn() {},
  };
  scene.cameras = { main: {} };
  scene.roomTransition = null;
  scene.deathRespawnSequence = null;
  scene.freezeTimer = 0;
  scene.forceCameraUpdate = false;
  scene.renderLighting = () => {};
  scene.updateHUD = () => {};
  scene.renderDebugOverlay = () => {};
  scene.renderSpawnWipe = () => {};
  scene.clearSpawnWipe = () => {};
  scene.updateRoomTransition = () => {};
  scene.updateDeathRespawnSequence = () => {};
  scene.updateCamera = () => {};
  scene.advancePlayerOnly = () => {};
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

describe("GameScene input edge lifecycle", () => {
  test("room transitions preserve gameplay press edges until the next fixed-step input gather", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    scene.roomTransition = {};
    (scene.update as (time: number, delta: number) => void)(0, 16);

    scene.roomTransition = null;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeTrue();
    expect(input.jumpPressed).toBeTrue();

    (scene.clearTransientKeyEdges as () => void)();
    const held = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(held.jump).toBeTrue();
    expect(held.jumpPressed).toBeFalse();
  });

  test("freeze frames preserve dash press edges for the first resumed gameplay step", async () => {
    const scene = await createSceneHarness();

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyK"));
    scene.freezeTimer = 0.05;
    (scene.update as (time: number, delta: number) => void)(0, 16);

    scene.freezeTimer = 0;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.dash).toBeTrue();
    expect(input.dashPressed).toBeTrue();
  });

  test("player time-pause frames preserve gameplay press edges for the first resumed gameplay step", async () => {
    const scene = await createSceneHarness();
    const player = scene.player as { timePaused: boolean };

    (scene.onKeyDown as (event: KeyboardEvent) => void)(keyDown("KeyJ"));
    player.timePaused = true;
    (scene.update as (time: number, delta: number) => void)(0, 16);

    player.timePaused = false;
    const input = (scene.gatherStepInput as () => ReturnType<PlayerControls["update"]>)();
    expect(input.jump).toBeTrue();
    expect(input.jumpPressed).toBeTrue();
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
