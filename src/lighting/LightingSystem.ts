import Phaser from "phaser";
import { VIEWPORT, WORLD } from "../constants";
import { EntityWorld } from "../entities/EntityWorld";
import { TILE_SOLID, tileAt } from "../grid";

const LIGHT_TEXTURE_KEY = "lighting-gradient";
const LIGHT_TEXTURE_SIZE = 256;
const AMBIENT_DARKNESS_ALPHA = 0.1;
const COLOR_LIGHT_ALPHA = 0.3;
const MIN_LIGHT_INTENSITY = 0.05;
const SOLID_MASK_PAD = 0.75;
const VISIBILITY_RAY_SAMPLES = 64;
const VISIBILITY_ANGLE_EPSILON = 0.0001;
const DISTANCE_EPSILON = 0.0001;

export interface LightingSource {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity?: number;
}

interface OccluderSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
}

interface BodyMaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VisibilityPoint {
  x: number;
  y: number;
  angle: number;
}

export class LightingSystem {
  private readonly scene: Phaser.Scene;
  private readonly occluders: readonly OccluderSegment[];
  private readonly bodyMasks: readonly BodyMaskRect[];
  private readonly darkness: Phaser.GameObjects.RenderTexture;
  private readonly color: Phaser.GameObjects.RenderTexture;
  private readonly lightBuffer: Phaser.GameObjects.RenderTexture;
  private readonly bodyMaskGraphics: Phaser.GameObjects.Graphics;
  private readonly lightMesh: Phaser.GameObjects.Mesh;
  private readonly lightTextureSize: number;

  constructor(scene: Phaser.Scene, world: EntityWorld) {
    this.scene = scene;

    if ((scene.game.renderer as { type?: number } | undefined)?.type !== Phaser.WEBGL) {
      console.warn("LightingSystem requires the WebGL renderer; Canvas fallback will not draw mesh lights.");
    }

    this.lightTextureSize = this.ensureLightTexture();
    this.occluders = buildOccluderSegments(world);
    this.bodyMasks = buildBodyMasks(world);

    this.darkness = scene.add
      .renderTexture(0, 0, VIEWPORT.width, VIEWPORT.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(8);

    this.color = scene.add
      .renderTexture(0, 0, VIEWPORT.width, VIEWPORT.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);

    this.lightBuffer = scene.add
      .renderTexture(0, 0, VIEWPORT.width, VIEWPORT.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(false);

    this.bodyMaskGraphics = scene.make.graphics({ x: 0, y: 0 }, false);
    this.lightMesh = scene.add
      .mesh(VIEWPORT.width * 0.5, VIEWPORT.height * 0.5, LIGHT_TEXTURE_KEY)
      .setScrollFactor(0)
      .setVisible(false);
    this.lightMesh.hideCCW = false;
    this.lightMesh.setOrtho(VIEWPORT.width, VIEWPORT.height);
  }

  destroy(): void {
    this.lightBuffer.destroy();
    this.bodyMaskGraphics.destroy();
    this.lightMesh.destroy();
    this.darkness.destroy();
    this.color.destroy();
  }

  render(camera: Phaser.Cameras.Scene2D.Camera, lights: ReadonlyArray<LightingSource>): void {
    const cameraX = camera.scrollX;
    const cameraY = camera.scrollY;
    const visibleBodyMasks = this.projectBodyMasks(cameraX, cameraY, camera.width, camera.height);

    this.color.clear();
    this.darkness.clear();
    this.darkness.fill(0x000000, AMBIENT_DARKNESS_ALPHA);

    for (const light of lights) {
      const intensity = Phaser.Math.Clamp(light.intensity ?? 1, 0, 1);
      if (intensity < MIN_LIGHT_INTENSITY || light.radius <= 0) {
        continue;
      }

      if (!this.isVisibleToCamera(cameraX, cameraY, camera.width, camera.height, light)) {
        continue;
      }

      const screenX = light.x - cameraX;
      const screenY = light.y - cameraY;
      const visiblePolygon = buildVisibilityPolygon(light, this.occluders).map((point) => ({
        x: point.x - cameraX,
        y: point.y - cameraY,
        angle: point.angle,
      }));
      if (visiblePolygon.length < 3) {
        continue;
      }

      this.populateLightMesh(screenX, screenY, light.radius, visiblePolygon);
      // We rebuild the mesh faces inside Scene.update, which happens after Phaser has already
      // run the Mesh preUpdate step for this frame. Refresh the transformed face coordinates
      // now so the newly-added vertices can actually render into the light buffer.
      this.refreshLightMeshTransform();

      this.lightBuffer.clear();
      this.lightMesh.setTint(0xffffff);
      this.lightMesh.setAlpha(intensity);
      // RenderTexture.draw uses exact coordinates for ordinary Game Objects, not offsets.
      // Let the mesh keep its centered scene position so the local-space vertices land correctly.
      this.lightBuffer.draw([this.lightMesh]);

      if (visibleBodyMasks.length > 0) {
        this.populateBodyMaskGraphics(this.bodyMaskGraphics, visibleBodyMasks, 0xffffff, 1);
        this.lightBuffer.erase([this.bodyMaskGraphics], 0, 0);
      }

      this.lightBuffer.setTint(light.color);
      this.lightBuffer.setAlpha(COLOR_LIGHT_ALPHA);
      this.color.draw([this.lightBuffer], 0, 0);
      this.lightBuffer.setTint(0xffffff);
      this.lightBuffer.setAlpha(1);
      this.darkness.erase([this.lightBuffer], 0, 0);
    }
  }

  private ensureLightTexture(): number {
    if (this.scene.textures.exists(LIGHT_TEXTURE_KEY)) {
      const frame = this.scene.textures.get(LIGHT_TEXTURE_KEY).get();
      return frame.width;
    }

    const renderer = this.scene.game.renderer;
    const maxTextureSize =
      "getMaxTextureSize" in renderer && typeof renderer.getMaxTextureSize === "function"
        ? renderer.getMaxTextureSize()
        : LIGHT_TEXTURE_SIZE;
    const size = Phaser.Math.Clamp(Math.min(LIGHT_TEXTURE_SIZE, maxTextureSize), 64, LIGHT_TEXTURE_SIZE);

    const texture = this.scene.textures.createCanvas(LIGHT_TEXTURE_KEY, size, size);
    if (texture === null) {
      throw new Error("Unable to create the lighting gradient texture");
    }

    const ctx = texture.context;
    const half = size * 0.5;
    const gradient = ctx.createRadialGradient(half, half, size * 0.08, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.16, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.42, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.28)");
    gradient.addColorStop(0.9, "rgba(255,255,255,0.08)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    texture.refresh();

    return size;
  }

  private isVisibleToCamera(
    cameraX: number,
    cameraY: number,
    cameraWidth: number,
    cameraHeight: number,
    light: LightingSource,
  ): boolean {
    const left = cameraX;
    const top = cameraY;
    const right = left + cameraWidth;
    const bottom = top + cameraHeight;

    return !(
      light.x + light.radius < left ||
      light.x - light.radius > right ||
      light.y + light.radius < top ||
      light.y - light.radius > bottom
    );
  }

  private populateLightMesh(
    screenX: number,
    screenY: number,
    radius: number,
    polygon: ReadonlyArray<VisibilityPoint>,
  ): void {
    const meshCenterX = VIEWPORT.width * 0.5;
    const meshCenterY = VIEWPORT.height * 0.5;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const pushVertex = (x: number, y: number): void => {
      vertices.push(x - meshCenterX, meshCenterY - y);
      uvs.push((x - screenX) / (radius * 2) + 0.5, 0.5 - (y - screenY) / (radius * 2));
    };

    pushVertex(screenX, screenY);
    for (const point of polygon) {
      pushVertex(point.x, point.y);
    }

    for (let index = 1; index < polygon.length; index++) {
      indices.push(0, index, index + 1);
    }
    indices.push(0, polygon.length, 1);

    this.lightMesh.clear();
    this.lightMesh.setTint(0xffffff);
    this.lightMesh.setAlpha(1);
    this.lightMesh.addVertices(vertices, uvs, indices);
  }

  private projectBodyMasks(
    cameraX: number,
    cameraY: number,
    cameraWidth: number,
    cameraHeight: number,
  ): BodyMaskRect[] {
    const rects: BodyMaskRect[] = [];
    const viewRight = cameraX + cameraWidth;
    const viewBottom = cameraY + cameraHeight;

    for (const body of this.bodyMasks) {
      const bodyRight = body.x + body.w;
      const bodyBottom = body.y + body.h;
      if (bodyRight <= cameraX || body.x >= viewRight || bodyBottom <= cameraY || body.y >= viewBottom) {
        continue;
      }

      rects.push({
        x: body.x - cameraX,
        y: body.y - cameraY,
        w: body.w,
        h: body.h,
      });
    }

    return rects;
  }

  private populateBodyMaskGraphics(
    graphics: Phaser.GameObjects.Graphics,
    rects: ReadonlyArray<BodyMaskRect>,
    color: number,
    alpha: number,
  ): void {
    graphics.clear();
    graphics.fillStyle(color, alpha);

    for (const rect of rects) {
      graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  private refreshLightMeshTransform(): void {
    (this.lightMesh as unknown as { preUpdate(time: number, delta: number): void }).preUpdate(0, 0);
  }
}

function buildOccluderSegments(world: EntityWorld): OccluderSegment[] {
  const segments: OccluderSegment[] = [];
  const cols = world.cols;
  const rows = world.rows;
  const tile = WORLD.tile;

  const isSolid = (col: number, row: number): boolean => tileAt(world, col, row) === TILE_SOLID;

  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let col = 0; col <= cols; col++) {
      const exposed = col < cols && isSolid(col, row) && !isSolid(col, row - 1);
      if (exposed && start < 0) {
        start = col;
      } else if (!exposed && start >= 0) {
        segments.push({
          ax: start * tile,
          ay: row * tile,
          bx: col * tile,
          by: row * tile,
          nx: 0,
          ny: -1,
        });
        start = -1;
      }
    }
  }

  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let col = 0; col <= cols; col++) {
      const exposed = col < cols && isSolid(col, row) && !isSolid(col, row + 1);
      if (exposed && start < 0) {
        start = col;
      } else if (!exposed && start >= 0) {
        segments.push({
          ax: start * tile,
          ay: (row + 1) * tile,
          bx: col * tile,
          by: (row + 1) * tile,
          nx: 0,
          ny: 1,
        });
        start = -1;
      }
    }
  }

  for (let col = 0; col < cols; col++) {
    let start = -1;
    for (let row = 0; row <= rows; row++) {
      const exposed = row < rows && isSolid(col, row) && !isSolid(col - 1, row);
      if (exposed && start < 0) {
        start = row;
      } else if (!exposed && start >= 0) {
        segments.push({
          ax: col * tile,
          ay: start * tile,
          bx: col * tile,
          by: row * tile,
          nx: -1,
          ny: 0,
        });
        start = -1;
      }
    }
  }

  for (let col = 0; col < cols; col++) {
    let start = -1;
    for (let row = 0; row <= rows; row++) {
      const exposed = row < rows && isSolid(col, row) && !isSolid(col + 1, row);
      if (exposed && start < 0) {
        start = row;
      } else if (!exposed && start >= 0) {
        segments.push({
          ax: (col + 1) * tile,
          ay: start * tile,
          bx: (col + 1) * tile,
          by: row * tile,
          nx: 1,
          ny: 0,
        });
        start = -1;
      }
    }
  }

  return segments;
}

function buildBodyMasks(world: EntityWorld): BodyMaskRect[] {
  const masks: BodyMaskRect[] = [];
  const cols = world.cols;
  const rows = world.rows;
  const tile = WORLD.tile;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = tileAt(world, col, row);
      const x = col * tile;
      const y = row * tile;

      if (cell === TILE_SOLID) {
        masks.push({
          x: x - SOLID_MASK_PAD,
          y: y - SOLID_MASK_PAD,
          w: tile + SOLID_MASK_PAD * 2,
          h: tile + SOLID_MASK_PAD * 2,
        });
      }
    }
  }

  return masks;
}

function buildVisibilityPolygon(
  light: LightingSource,
  occluders: ReadonlyArray<OccluderSegment>,
): VisibilityPoint[] {
  const clippedSegments = occluders
    .map((segment) => clipSegmentToLightRadius(segment, light.x, light.y, light.radius))
    .filter((segment): segment is OccluderSegment => segment !== null);
  const angles = collectVisibilityAngles(light.x, light.y, clippedSegments);
  const hits = angles
    .map((angle) => castVisibilityRay(light.x, light.y, angle, light.radius, clippedSegments))
    .sort((a, b) => a.angle - b.angle);

  return dedupeVisibilityPoints(hits);
}

function collectVisibilityAngles(
  lightX: number,
  lightY: number,
  occluders: ReadonlyArray<OccluderSegment>,
): number[] {
  const uniqueAngles = new Map<string, number>();
  const addAngle = (angle: number): void => {
    const normalized = normalizeAngle(angle);
    uniqueAngles.set(normalized.toFixed(6), normalized);
  };

  for (let sample = 0; sample < VISIBILITY_RAY_SAMPLES; sample++) {
    addAngle((sample / VISIBILITY_RAY_SAMPLES) * Math.PI * 2);
  }

  for (const segment of occluders) {
    const endpointAngles = [
      Math.atan2(segment.ay - lightY, segment.ax - lightX),
      Math.atan2(segment.by - lightY, segment.bx - lightX),
    ];

    for (const angle of endpointAngles) {
      addAngle(angle - VISIBILITY_ANGLE_EPSILON);
      addAngle(angle);
      addAngle(angle + VISIBILITY_ANGLE_EPSILON);
    }
  }

  return Array.from(uniqueAngles.values());
}

function castVisibilityRay(
  lightX: number,
  lightY: number,
  angle: number,
  radius: number,
  occluders: ReadonlyArray<OccluderSegment>,
): VisibilityPoint {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let nearestDistance = radius;
  let hitX = lightX + dirX * radius;
  let hitY = lightY + dirY * radius;

  for (const segment of occluders) {
    const hit = intersectRayWithSegment(lightX, lightY, dirX, dirY, segment);
    if (hit === null || hit.distance >= nearestDistance) {
      continue;
    }

    nearestDistance = hit.distance;
    hitX = hit.x;
    hitY = hit.y;
  }

  return {
    x: hitX,
    y: hitY,
    angle: normalizeAngle(angle),
  };
}

function dedupeVisibilityPoints(points: ReadonlyArray<VisibilityPoint>): VisibilityPoint[] {
  const deduped: VisibilityPoint[] = [];

  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) <= 0.01) {
      continue;
    }

    deduped.push(point);
  }

  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.y - last.y) <= 0.01) {
      deduped.pop();
    }
  }

  return deduped;
}

function clipSegmentToLightRadius(
  segment: OccluderSegment,
  lightX: number,
  lightY: number,
  radius: number,
): OccluderSegment | null {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= DISTANCE_EPSILON) {
    const pointDistanceSq = (segment.ax - lightX) * (segment.ax - lightX) + (segment.ay - lightY) * (segment.ay - lightY);
    return pointDistanceSq <= radius * radius ? segment : null;
  }

  const fx = segment.ax - lightX;
  const fy = segment.ay - lightY;
  const a = lengthSq;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t0 = (-b - sqrtDiscriminant) / (2 * a);
  const t1 = (-b + sqrtDiscriminant) / (2 * a);
  const startT = Phaser.Math.Clamp(Math.min(t0, t1), 0, 1);
  const endT = Phaser.Math.Clamp(Math.max(t0, t1), 0, 1);

  if (endT - startT <= DISTANCE_EPSILON) {
    return null;
  }

  return {
    ax: segment.ax + dx * startT,
    ay: segment.ay + dy * startT,
    bx: segment.ax + dx * endT,
    by: segment.ay + dy * endT,
    nx: segment.nx,
    ny: segment.ny,
  };
}

function intersectRayWithSegment(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  segment: OccluderSegment,
): { x: number; y: number; distance: number } | null {
  const segX = segment.bx - segment.ax;
  const segY = segment.by - segment.ay;
  const denom = cross(dirX, dirY, segX, segY);
  if (Math.abs(denom) <= DISTANCE_EPSILON) {
    return null;
  }

  const offsetX = segment.ax - originX;
  const offsetY = segment.ay - originY;
  const rayDistance = cross(offsetX, offsetY, segX, segY) / denom;
  const segDistance = cross(offsetX, offsetY, dirX, dirY) / denom;

  if (rayDistance < 0 || segDistance < -DISTANCE_EPSILON || segDistance > 1 + DISTANCE_EPSILON) {
    return null;
  }

  return {
    x: originX + dirX * rayDistance,
    y: originY + dirY * rayDistance,
    distance: rayDistance,
  };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export const __lightingTestUtils = {
  buildBodyMasks,
  buildOccluderSegments,
  buildVisibilityPolygon,
};
