import Phaser from "phaser";
import {
  DisplacementBurstModel,
  type ProjectedDisplacementBurst,
  projectBurstToPostFx,
} from "./ripple";

const DISPLACEMENT_PIPELINE_KEY = "DashDisplacementPipeline";
const MAX_SHADER_BURSTS = 4;
const NEAREST_RENDER_TARGET_FILTER = 1;

const DASH_DISPLACEMENT_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform int uBurstCount;
uniform vec2 uResolution;
uniform vec2 uCenters[${MAX_SHADER_BURSTS}];
uniform float uRadii[${MAX_SHADER_BURSTS}];
uniform float uRingWidths[${MAX_SHADER_BURSTS}];
uniform float uAmplitudes[${MAX_SHADER_BURSTS}];
uniform float uStrengths[${MAX_SHADER_BURSTS}];

varying vec2 outTexCoord;

void main() {
  vec2 pixel = outTexCoord * uResolution;
  vec2 offset = vec2(0.0);

  for (int i = 0; i < ${MAX_SHADER_BURSTS}; i++) {
    if (i >= uBurstCount) {
      break;
    }

    vec2 delta = pixel - uCenters[i];
    float dist = length(delta);
    float ringDistance = abs(dist - uRadii[i]);
    float envelope = 1.0 - smoothstep(0.0, uRingWidths[i], ringDistance);
    float wave = sin((dist - uRadii[i]) * 1.8) * envelope;
    vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0);
    offset += dir * wave * uAmplitudes[i] * uStrengths[i];
  }

  vec2 displacedCoord = clamp(outTexCoord - offset / uResolution, vec2(0.001), vec2(0.999));
  gl_FragColor = texture2D(uMainSampler, displacedCoord);
}
`;

export class DashDisplacementPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private burstCount = 0;
  private resolutionX = 1;
  private resolutionY = 1;
  private readonly centers = new Float32Array(MAX_SHADER_BURSTS * 2);
  private readonly radii = new Float32Array(MAX_SHADER_BURSTS);
  private readonly ringWidths = new Float32Array(MAX_SHADER_BURSTS);
  private readonly amplitudes = new Float32Array(MAX_SHADER_BURSTS);
  private readonly strengths = new Float32Array(MAX_SHADER_BURSTS);

  constructor(game: Phaser.Game) {
    super({
      game,
      fragShader: DASH_DISPLACEMENT_FRAG,
      renderTarget: [{ minFilter: NEAREST_RENDER_TARGET_FILTER, autoResize: true }],
    });
  }

  setBursts(bursts: readonly ProjectedDisplacementBurst[], width: number, height: number): void {
    this.burstCount = Math.min(bursts.length, MAX_SHADER_BURSTS);
    this.resolutionX = Math.max(1, width);
    this.resolutionY = Math.max(1, height);
    this.centers.fill(0);
    this.radii.fill(0);
    this.ringWidths.fill(1);
    this.amplitudes.fill(0);
    this.strengths.fill(0);

    for (let i = 0; i < this.burstCount; i++) {
      const burst = bursts[i];
      this.centers[i * 2] = burst.screenX;
      this.centers[i * 2 + 1] = burst.screenY;
      this.radii[i] = burst.radius;
      this.ringWidths[i] = burst.ringWidth;
      this.amplitudes[i] = burst.amplitude;
      this.strengths[i] = burst.strength;
    }

    // Keep the whole camera on one render path so dash start/end does not
    // toggle full-viewport framebuffer sampling and visibly change sharp edges.
    this.active = true;
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set1i("uBurstCount", this.burstCount);
    this.set2f("uResolution", this.resolutionX, this.resolutionY);
    this.set2fv("uCenters", this.centers);
    this.set1fv("uRadii", this.radii);
    this.set1fv("uRingWidths", this.ringWidths);
    this.set1fv("uAmplitudes", this.amplitudes);
    this.set1fv("uStrengths", this.strengths);
    this.bindAndDraw(renderTarget);
  }
}

export class DisplacementSystem {
  private readonly model = new DisplacementBurstModel();
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pipeline: DashDisplacementPipeline | null;

  constructor(private readonly scene: Phaser.Scene, camera = scene.cameras.main) {
    this.camera = camera;
    this.pipeline = this.installPipeline();
    this.syncPipeline();
  }

  addBurst(x: number, y: number): void {
    if (this.pipeline === null) return;

    this.model.addBurst(x, y);
    this.syncPipeline();
  }

  update(dt: number): void {
    if (this.pipeline === null) return;

    this.model.update(dt);
    this.syncPipeline();
  }

  clear(): void {
    this.model.clear();
    this.syncPipeline();
  }

  destroy(): void {
    this.clear();
    if (this.pipeline !== null) {
      this.camera.removePostPipeline(DISPLACEMENT_PIPELINE_KEY);
    }
  }

  private installPipeline(): DashDisplacementPipeline | null {
    const renderer = this.scene.game.renderer;
    if (renderer.type !== Phaser.WEBGL || !("pipelines" in renderer)) {
      return null;
    }

    renderer.pipelines.addPostPipeline(DISPLACEMENT_PIPELINE_KEY, DashDisplacementPipeline);
    this.camera.setPostPipeline(DISPLACEMENT_PIPELINE_KEY);
    const pipeline = this.camera.getPostPipeline(DISPLACEMENT_PIPELINE_KEY);
    return Array.isArray(pipeline)
      ? (pipeline[0] as DashDisplacementPipeline | undefined) ?? null
      : (pipeline as DashDisplacementPipeline | null);
  }

  private syncPipeline(): void {
    if (this.pipeline === null) return;

    const bursts = this.model.shaderBursts().map((burst) => projectBurstToPostFx(burst, this.camera));

    this.pipeline.setBursts(bursts, this.camera.width, this.camera.height);
  }
}
