export interface DisplacementBurstConfig {
  duration: number;
  startRadius: number;
  endRadius: number;
  ringWidth: number;
  amplitude: number;
  strength: number;
  maxBursts: number;
}

export interface DisplacementBurst {
  x: number;
  y: number;
  age: number;
}

export interface DisplacementShaderBurst {
  x: number;
  y: number;
  radius: number;
  ringWidth: number;
  amplitude: number;
  strength: number;
}

export interface ProjectedDisplacementBurst extends DisplacementShaderBurst {
  screenX: number;
  screenY: number;
}

export interface DisplacementCameraProjection {
  scrollX: number;
  scrollY: number;
  height: number;
}

export const DASH_DISPLACEMENT_CONFIG: Readonly<DisplacementBurstConfig> = Object.freeze({
  duration: 0.4,
  startRadius: 2,
  endRadius: 16,
  ringWidth: 2,
  amplitude: 4,
  strength: 0.5,
  maxBursts: 4,
});

export function easeQuadOut(t: number): number {
  const clamped = clamp01(t);
  return 1 - (1 - clamped) * (1 - clamped);
}

export function projectBurstToPostFx(
  burst: DisplacementShaderBurst,
  camera: DisplacementCameraProjection,
): ProjectedDisplacementBurst {
  const screenY = burst.y - camera.scrollY;

  return {
    ...burst,
    screenX: burst.x - camera.scrollX,
    screenY: camera.height - screenY,
  };
}

export class DisplacementBurstModel {
  private readonly bursts: DisplacementBurst[] = [];

  constructor(private readonly config: Readonly<DisplacementBurstConfig> = DASH_DISPLACEMENT_CONFIG) {}

  addBurst(x: number, y: number): void {
    this.bursts.push({ x, y, age: 0 });
    while (this.bursts.length > this.config.maxBursts) {
      this.bursts.shift();
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;

    for (const burst of this.bursts) {
      burst.age += dt;
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      if (this.bursts[i].age >= this.config.duration) {
        this.bursts.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.bursts.length = 0;
  }

  hasActiveBursts(): boolean {
    return this.bursts.length > 0;
  }

  shaderBursts(): DisplacementShaderBurst[] {
    return this.bursts.map((burst) => {
      const progress = clamp01(burst.age / this.config.duration);
      const easedRadius = easeQuadOut(progress);
      const radius = lerp(this.config.startRadius, this.config.endRadius, easedRadius);
      const fade = 1 - easedRadius;

      return {
        x: burst.x,
        y: burst.y,
        radius,
        ringWidth: this.config.ringWidth,
        amplitude: this.config.amplitude,
        strength: this.config.strength * fade,
      };
    });
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
