export interface GroundProbe {
  onGround: boolean;
  onJumpThrough: boolean;
}

export interface CollisionWorld {
  readonly cols: number;
  readonly rows: number;
  collideSolidAt(x: number, y: number, w: number, h: number): boolean;
  collideAt(
    x: number,
    y: number,
    w: number,
    h: number,
    fromY: number,
    movingDown: boolean,
  ): boolean;
  wallDirAt(x: number, y: number, w: number, h: number): number;
  probeGround(x: number, y: number, w: number, h: number): GroundProbe;
  overlapsJumpThrough(x: number, y: number, w: number, h: number): boolean;
  wouldLandOnJumpThruAt(x: number, y: number, w: number, h: number, dist: number): boolean;
  findJumpThruNudgeY(x: number, y: number, w: number, h: number, maxNudge: number): number | null;
  collidesWithSpikeAt(
    x: number,
    y: number,
    w: number,
    h: number,
    vx: number,
    vy: number,
  ): boolean;
}
