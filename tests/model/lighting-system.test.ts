import { describe, expect, mock, test } from "bun:test";
import type Phaser from "phaser";
import { VIEWPORT, WORLD } from "../../src/constants.ts";
import { EntityWorld } from "../../src/entities/EntityWorld.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";

interface MockOperation {
  op: string;
  [key: string]: unknown;
}

class MockRenderTexture {
  readonly operations: MockOperation[] = [];

  constructor(readonly name: string) {}

  setOrigin(_x: number, _y: number): this {
    return this;
  }

  setScrollFactor(_value: number): this {
    return this;
  }

  setDepth(_depth: number): this {
    return this;
  }

  setBlendMode(_mode: number): this {
    return this;
  }

  setVisible(value: boolean): this {
    this.operations.push({ op: "setVisible", value });
    return this;
  }

  setTint(tint: number): this {
    this.operations.push({ op: "setTint", tint });
    return this;
  }

  setAlpha(alpha: number): this {
    this.operations.push({ op: "setAlpha", alpha });
    return this;
  }

  clear(): this {
    this.operations.push({ op: "clear" });
    return this;
  }

  fill(color: number, alpha: number): this {
    this.operations.push({ op: "fill", color, alpha });
    return this;
  }

  stamp(key: string, _frame: unknown, x: number, y: number, config: Record<string, unknown>): this {
    this.operations.push({ op: "stamp", key, x, y, config });
    return this;
  }

  draw(entries: unknown, ...args: Array<number | undefined>): this {
    const [x = 0, y = 0, alpha, tint] = args;
    this.operations.push({ op: "draw", entries, x, y, alpha, tint, argCount: args.length });
    return this;
  }

  erase(entries: unknown, ...args: Array<number | undefined>): this {
    const [x = 0, y = 0] = args;
    this.operations.push({ op: "erase", entries, x, y, argCount: args.length });
    return this;
  }

  destroy(): this {
    this.operations.push({ op: "destroy" });
    return this;
  }
}

class MockGraphics {
  readonly operations: MockOperation[] = [];

  constructor(readonly name: string) {}

  clear(): this {
    this.operations.push({ op: "clear" });
    return this;
  }

  fillStyle(color: number, alpha: number): this {
    this.operations.push({ op: "fillStyle", color, alpha });
    return this;
  }

  fillPoints(points: Array<{ x: number; y: number }>, closePath: boolean): this {
    this.operations.push({
      op: "fillPoints",
      points: points.map((point) => ({ ...point })),
      closePath,
    });
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.operations.push({ op: "fillRect", x, y, w, h });
    return this;
  }

  destroy(): this {
    this.operations.push({ op: "destroy" });
    return this;
  }
}

class MockMesh {
  readonly operations: MockOperation[] = [];
  hideCCW = true;

  constructor(readonly name: string) {}

  setScrollFactor(_value: number): this {
    return this;
  }

  setVisible(value: boolean): this {
    this.operations.push({ op: "setVisible", value });
    return this;
  }

  setOrtho(scaleX: number, scaleY: number): this {
    this.operations.push({ op: "setOrtho", scaleX, scaleY });
    return this;
  }

  clear(): this {
    this.operations.push({ op: "clear" });
    return this;
  }

  setTint(tint: number): this {
    this.operations.push({ op: "setTint", tint });
    return this;
  }

  setAlpha(alpha: number): this {
    this.operations.push({ op: "setAlpha", alpha });
    return this;
  }

  preUpdate(time: number, delta: number): this {
    this.operations.push({ op: "preUpdate", time, delta });
    return this;
  }

  addVertices(vertices: number[], uvs: number[], indices: number[]): this {
    this.operations.push({
      op: "addVertices",
      vertices: [...vertices],
      uvs: [...uvs],
      indices: [...indices],
    });
    return this;
  }

  destroy(): this {
    this.operations.push({ op: "destroy" });
    return this;
  }
}

function createMockScene(): {
  scene: Phaser.Scene;
  renderTextures: MockRenderTexture[];
  graphics: MockGraphics[];
  meshes: MockMesh[];
} {
  const renderTextures: MockRenderTexture[] = [];
  const graphics: MockGraphics[] = [];
  const meshes: MockMesh[] = [];

  const scene = {
    add: {
      renderTexture: () => {
        const texture = new MockRenderTexture(`rt-${renderTextures.length}`);
        renderTextures.push(texture);
        return texture;
      },
      mesh: () => {
        const mesh = new MockMesh(`mesh-${meshes.length}`);
        meshes.push(mesh);
        return mesh;
      },
    },
    make: {
      graphics: () => {
        const instance = new MockGraphics(`gfx-${graphics.length}`);
        graphics.push(instance);
        return instance;
      },
    },
    textures: {
      exists: () => true,
      get: () => ({
        get: () => ({ width: 256 }),
      }),
    },
    game: {
      renderer: { type: "WEBGL" },
    },
  } as unknown as Phaser.Scene;

  return { scene, renderTextures, graphics, meshes };
}

function createCamera(): Phaser.Cameras.Scene2D.Camera {
  return {
    scrollX: 0,
    scrollY: 0,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  } as Phaser.Cameras.Scene2D.Camera;
}

function makeFloor(row: number, fromCol: number, toCol: number): LevelEntitySpec[] {
  const specs: LevelEntitySpec[] = [];

  for (let col = fromCol; col <= toCol; col++) {
    specs.push({ kind: "solidTile", col, row });
  }

  return specs;
}

async function loadLightingModule(): Promise<typeof import("../../src/lighting/LightingSystem.ts")> {
  mock.module("phaser", () => ({
    default: {
      Math: {
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      },
      BlendModes: {
        ADD: "ADD",
      },
      WEBGL: "WEBGL",
    },
  }));

  return import("../../src/lighting/LightingSystem.ts");
}

describe("LightingSystem", () => {
  test("composites each visibility-mesh light through the per-light buffer and darkness erase", async () => {
    const { LightingSystem } = await loadLightingModule();
    const { scene, renderTextures, graphics, meshes } = createMockScene();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, [{ kind: "solidTile", col: 10, row: 10 }]);
    const lighting = new LightingSystem(scene, world);

    lighting.render(createCamera(), [
      { x: 10 * WORLD.tile + WORLD.tile * 0.5, y: 10 * WORLD.tile - 4, radius: 24, color: 0xffddaa, intensity: 0.8 },
    ]);

    const [darkness, color, lightBuffer] = renderTextures;
    const [bodyMaskGraphics] = graphics;
    const [lightMesh] = meshes;

    expect(lightBuffer).toBeDefined();
    expect(
      lightBuffer?.operations.some(
        (operation) =>
          operation.op === "draw" &&
          Array.isArray(operation.entries) &&
          operation.entries[0] === lightMesh &&
          operation.argCount === 0,
      ),
    ).toBeTrue();
    expect(
      lightBuffer?.operations.some(
        (operation) =>
          operation.op === "erase" &&
          Array.isArray(operation.entries) &&
          operation.entries[0] === bodyMaskGraphics,
      ),
    ).toBeTrue();
    expect(
      color?.operations.some(
        (operation) =>
          operation.op === "draw" &&
          Array.isArray(operation.entries) &&
          operation.entries[0] === lightBuffer,
      ),
    ).toBeTrue();
    expect(
      darkness?.operations.some(
        (operation) =>
          operation.op === "erase" &&
          Array.isArray(operation.entries) &&
          operation.entries[0] === lightBuffer,
      ),
    ).toBeTrue();
    expect(darkness?.operations.some((operation) => operation.op === "draw")).toBeFalse();
  });

  test("visibility polygon blocks light from leaking above the center of a long solid platform", async () => {
    const { __lightingTestUtils } = await loadLightingModule();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, makeFloor(10, 0, 15));
    const light = { x: 6 * WORLD.tile, y: 10 * WORLD.tile + 12, radius: 20, color: 0xffffff, intensity: 1 };
    const polygon = __lightingTestUtils.buildVisibilityPolygon(light, __lightingTestUtils.buildOccluderSegments(world));
    const platformTopY = 10 * WORLD.tile;
    const pointsAbovePlatformCenter = polygon.filter(
      (point) => point.x > light.x - WORLD.tile && point.x < light.x + WORLD.tile && point.y < platformTopY - 0.01,
    );

    expect(pointsAbovePlatformCenter).toHaveLength(0);
  });

  test("keeps mesh geometry at subpixel precision instead of snapping to whole pixels", async () => {
    const { LightingSystem } = await loadLightingModule();
    const { scene, meshes } = createMockScene();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, makeFloor(10, 0, 15));
    const lighting = new LightingSystem(scene, world);

    lighting.render(createCamera(), [
      { x: 6 * WORLD.tile + 0.5, y: 10 * WORLD.tile - 4.25, radius: 20.5, color: 0xffffff, intensity: 1 },
    ]);

    const lightMesh = meshes[0];
    const addVertices = lightMesh?.operations.find((operation) => operation.op === "addVertices");
    const vertices = (addVertices?.vertices as number[] | undefined) ?? [];

    expect(vertices.length).toBeGreaterThan(0);
    expect(vertices.some((value) => !Number.isInteger(value))).toBeTrue();
  });

  test("draws the light mesh using its own centered transform instead of forcing it to the render-texture origin", async () => {
    const { LightingSystem } = await loadLightingModule();
    const { scene, renderTextures, meshes } = createMockScene();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, makeFloor(10, 0, 15));
    const lighting = new LightingSystem(scene, world);

    lighting.render(createCamera(), [
      { x: 6 * WORLD.tile + 0.5, y: 10 * WORLD.tile - 4.25, radius: 20.5, color: 0xffffff, intensity: 1 },
    ]);

    const lightBuffer = renderTextures[2];
    const lightMesh = meshes[0];
    const meshDraw = lightBuffer?.operations.find(
      (operation) =>
        operation.op === "draw" &&
        Array.isArray(operation.entries) &&
        operation.entries[0] === lightMesh,
    );

    expect(meshDraw).toBeDefined();
    expect(meshDraw?.argCount).toBe(0);
  });

  test("refreshes the mesh transform after rebuilding vertices so the current frame can render the spotlight", async () => {
    const { LightingSystem } = await loadLightingModule();
    const { scene, meshes } = createMockScene();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, makeFloor(10, 0, 15));
    const lighting = new LightingSystem(scene, world);

    lighting.render(createCamera(), [
      { x: 6 * WORLD.tile + 0.5, y: 10 * WORLD.tile - 4.25, radius: 20.5, color: 0xffffff, intensity: 1 },
    ]);

    const lightMesh = meshes[0];
    const addVerticesIndex = lightMesh?.operations.findIndex((operation) => operation.op === "addVertices") ?? -1;
    const preUpdateIndex = lightMesh?.operations.findIndex((operation) => operation.op === "preUpdate") ?? -1;

    expect(addVerticesIndex).toBeGreaterThanOrEqual(0);
    expect(preUpdateIndex).toBeGreaterThan(addVerticesIndex);
  });

  test("masks solid tiles edge-to-edge so exposed faces do not leak light through a one-pixel shell", async () => {
    const { __lightingTestUtils } = await loadLightingModule();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, [{ kind: "solidTile", col: 10, row: 10 }]);
    const [solidMask] = __lightingTestUtils.buildBodyMasks(world);

    expect(solidMask).toMatchObject({
      x: 10 * WORLD.tile - 0.75,
      y: 10 * WORLD.tile - 0.75,
      w: WORLD.tile + 1.5,
      h: WORLD.tile + 1.5,
    });
  });

  test("jump-through platforms do not contribute occluders or body masks", async () => {
    const { __lightingTestUtils } = await loadLightingModule();
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, [{ kind: "jumpThruTile", col: 10, row: 10 }]);
    expect(__lightingTestUtils.buildOccluderSegments(world)).toHaveLength(0);
    expect(__lightingTestUtils.buildBodyMasks(world)).toHaveLength(0);
  });
});
