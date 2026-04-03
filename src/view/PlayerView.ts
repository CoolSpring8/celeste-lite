import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_VISUALS } from "../constants";
import { PlayerEffect, PlayerSnapshot } from "../player/types";

type Sqrt11Pose = "idle" | "duck";

type PixelRun = readonly [x: number, width: number];

interface PixelGlyph {
  width: number;
  height: number;
  hairRows: readonly (readonly PixelRun[])[];
  bodyRows: readonly (readonly PixelRun[])[];
}

const SQRT11_GLYPHS: Record<Sqrt11Pose, PixelGlyph> = {
  idle: {
    width: 8,
    height: 11,
    hairRows: [
      [],
      [[2, 6]],
      [[2, 6]],
      [[2, 1]],
      [[2, 1]],
      [[0, 1], [2, 1]],
      [[0, 3]],
      [[0, 3]],
      [[0, 3]],
      [[1, 1]],
      [[1, 1]],
    ],
    bodyRows: [
      [],
      [],
      [],
      [],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
    ],
  },
  duck: {
    width: 8,
    height: 6,
    hairRows: [
      [[3, 5]],
      [[2, 6]],
      [[0, 1], [2, 2]],
      [[0, 3]],
      [[0, 3]],
      [[1, 1]],
    ],
    bodyRows: [
      [],
      [],
      [],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
      [[4, 1], [6, 1]],
    ],
  },
};

interface Afterimage {
  sprite: GlyphSprite;
  life: number;
  maxLife: number;
}

interface GlyphSprite {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  hair: Phaser.GameObjects.Image;
}

export class PlayerView {
  private scene: Phaser.Scene;
  private playerSprite: GlyphSprite;
  private dashSlash: Phaser.GameObjects.Rectangle;
  private afterimages: Afterimage[] = [];
  private afterimagePool: GlyphSprite[] = [];
  private trailTimer = 0;
  private dashParticleTimer = 0;
  private dashSlashTimer = 0;
  private wallDustTimer = 0;
  private dashTrailColor: number = COLORS.playerOneDash;
  private dashDirX = 1;
  private dashDirY = 0;
  private prevCrouched: boolean | null = null;
  private prevOnGround = false;
  private prevState: PlayerSnapshot["state"] = "normal";
  private facing: PlayerSnapshot["facing"] = 1;

  private dashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private wallEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensurePixelTexture();
    this.ensureGlyphTextures();

    this.playerSprite = this.createGlyphSprite(5);

    this.dashSlash = this.scene.add
      .rectangle(
        0,
        0,
        PLAYER_VISUALS.dashSlashLength,
        PLAYER_VISUALS.dashSlashThickness,
        0xffffff,
      )
      .setOrigin(0.5)
      .setDepth(6)
      .setVisible(false);

    this.dashEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: PLAYER_VISUALS.dashParticleSpeedMin, max: PLAYER_VISUALS.dashParticleSpeedMax },
      lifespan: {
        min: PLAYER_VISUALS.dashParticleLifeMinMs,
        max: PLAYER_VISUALS.dashParticleLifeMaxMs,
      },
      quantity: 0,
      scale: 1,
      alpha: { start: 1, end: 0 },
      tint: COLORS.playerNoDash,
      gravityY: PLAYER_VISUALS.dashParticleGravityY,
      emitting: false,
      blendMode: "NORMAL",
    });
    this.dashEmitter.setDepth(4);

    this.wallEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: PLAYER_VISUALS.dustSpeedMin, max: PLAYER_VISUALS.dustSpeedMax },
      lifespan: { min: PLAYER_VISUALS.dustLifeMinMs, max: PLAYER_VISUALS.dustLifeMaxMs },
      quantity: 0,
      scale: { start: 1, end: 0.1 },
      alpha: 0.7,
      tint: COLORS.dust,
      gravityY: PLAYER_VISUALS.dustGravityY,
      emitting: false,
    });
    this.wallEmitter.setDepth(2);
  }

  render(snapshot: PlayerSnapshot, effects: PlayerEffect[], dt: number): void {
    this.syncFacing(snapshot.facing);
    this.applyFastFallScale(snapshot);
    this.processEffects(snapshot, effects);
    this.processDuckStateTransition(snapshot);
    this.relaxScale(dt);
    this.updateAfterimages(dt);
    this.updateDashSlash(dt);
    this.updateTrail(snapshot, dt);

    const drawX = snapshot.x;
    const drawY = snapshot.y;
    const pose = this.resolveSqrt11Pose(snapshot);

    this.applyGlyphSprite(
      this.playerSprite,
      pose,
      drawX,
      drawY,
      snapshot.drawW,
      snapshot.drawH,
      this.resolveBodyColor(snapshot),
      this.resolveHairColor(snapshot),
    );

    this.prevCrouched = snapshot.isCrouched;
    this.prevOnGround = snapshot.onGround;
    this.prevState = snapshot.state;
  }

  destroy(): void {
    this.destroyGlyphSprite(this.playerSprite);
    this.dashSlash.destroy();
    this.dashEmitter.destroy();
    this.wallEmitter.destroy();

    for (const a of this.afterimages) {
      this.destroyGlyphSprite(a.sprite);
    }
    for (const sprite of this.afterimagePool) {
      this.destroyGlyphSprite(sprite);
    }

    this.afterimages = [];
    this.afterimagePool = [];
  }

  private processEffects(snapshot: PlayerSnapshot, effects: PlayerEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "dash_begin":
          this.captureDashVisuals(snapshot, effect);
          this.emitDashBeginBurst(snapshot);
          this.squash(0.72, 1.28);
          break;
        case "super":
          this.squash(PLAYER_VISUALS.jumpSquashX, PLAYER_VISUALS.jumpSquashY);
          this.emitJumpDust(snapshot, PLAYER_VISUALS.jumpDustCount);
          break;
        case "hyper":
        case "wavedash":
          this.squash(PLAYER_VISUALS.jumpSquashX, PLAYER_VISUALS.jumpSquashY);
          this.emitJumpDust(snapshot, PLAYER_VISUALS.jumpDustCount);
          break;
        case "ultra":
          break;
        case "jump":
          this.squash(PLAYER_VISUALS.jumpSquashX, PLAYER_VISUALS.jumpSquashY);
          this.emitJumpDust(snapshot, PLAYER_VISUALS.jumpDustCount);
          break;
        case "wall_jump":
          this.squash(PLAYER_VISUALS.jumpSquashX, PLAYER_VISUALS.jumpSquashY);
          this.emitWallJumpDust(
            snapshot,
            effect.wallDir ?? snapshot.wallDir,
            PLAYER_VISUALS.wallJumpDustCount,
          );
          break;
        case "dash_start":
          this.captureDashVisuals(snapshot, effect);
          this.emitDashCommitBurst(snapshot);
          this.emitDashSlash(snapshot);
          this.addCameraImpulse(this.dashDirX * 3, this.dashDirY * 3);
          break;
        case "wall_bounce":
          this.squash(0.55, 1.5);
          this.scene.cameras.main.shake(70, 0.003);
          break;
        case "land": {
          const impact = Phaser.Math.Clamp(effect.impact ?? 0, 0, 1);
          this.squash(
            Phaser.Math.Linear(1, PLAYER_VISUALS.landSquashMaxX, impact),
            Phaser.Math.Linear(1, PLAYER_VISUALS.landSquashMinY, impact),
          );
          const dustImpact = PLAYER_CONFIG.gravity.maxFall / (2 * PLAYER_CONFIG.gravity.fastMaxFall);
          if (impact >= dustImpact) {
            this.emitLandDust(snapshot, PLAYER_VISUALS.landDustCount);
          }
          break;
        }
        case "respawn":
          this.scene.cameras.main.flash(120, 255, 255, 255, false);
          break;
        case "fell_out":
          this.scene.cameras.main.fadeOut(90, 10, 10, 20);
          break;
      }
    }
  }

  private updateTrail(snapshot: PlayerSnapshot, dt: number): void {
    if (snapshot.wallDustDir !== 0) {
      this.wallDustTimer -= dt;
      if (this.wallDustTimer <= 0) {
        this.wallDustTimer = PLAYER_VISUALS.wallSlideDustInterval;
        this.emitWallSlideDust(
          snapshot,
          snapshot.wallDustDir,
          PLAYER_VISUALS.wallSlideDustCount,
        );
      }
    }

    const dashActive = snapshot.state === "dash" &&
      (Math.abs(snapshot.vx) > 0.001 || Math.abs(snapshot.vy) > 0.001);

    if (!dashActive) {
      if (this.prevState === "dash") {
        this.spawnAfterimage(snapshot, this.dashTrailColor);
      }
      this.trailTimer = 0;
      this.dashParticleTimer = 0;
      return;
    }

    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = PLAYER_VISUALS.dashTrailInterval;
      this.spawnAfterimage(snapshot, this.dashTrailColor);
    }

    this.dashParticleTimer -= dt;
    if (this.dashParticleTimer <= 0) {
      this.dashParticleTimer = PLAYER_VISUALS.dashParticleInterval;

      const cx = snapshot.centerX;
      const cy = snapshot.centerY;
      const baseSpeed = 45;
      const spread = 35;
      const xBias = this.dashDirX * baseSpeed;
      const yBias = this.dashDirY * baseSpeed;
      this.dashEmitter.speedX = { min: xBias - spread, max: xBias + spread };
      this.dashEmitter.speedY = { min: yBias - spread, max: yBias + spread };
      this.dashEmitter.emitParticleAt(cx, cy, PLAYER_VISUALS.dashParticleCount);
    }
  }

  private updateAfterimages(dt: number): void {
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      if (a.life <= 0) {
        a.sprite.container.setVisible(false);
        this.afterimagePool.push(a.sprite);
        this.afterimages[i] = this.afterimages[this.afterimages.length - 1];
        this.afterimages.pop();
        continue;
      }

      a.sprite.container.alpha = a.life / a.maxLife;
    }
  }

  private updateDashSlash(dt: number): void {
    if (this.dashSlashTimer <= 0) {
      this.dashSlash.setVisible(false);
      return;
    }

    this.dashSlashTimer = Math.max(0, this.dashSlashTimer - dt);
    const life = PLAYER_VISUALS.dashSlashLife;
    const t = life > 0 ? this.dashSlashTimer / life : 0;
    this.dashSlash
      .setVisible(true)
      .setAlpha(0.85 * t)
      .setScale(1 + (1 - t) * 0.35, Phaser.Math.Linear(1.1, 0.75, 1 - t));
  }

  private spawnAfterimage(snapshot: PlayerSnapshot, color: number): void {
    const drawX = snapshot.x;
    const drawY = snapshot.y;
    const sprite = this.getAfterimageSprite();
    const pose = this.resolveSqrt11Pose(snapshot);

    sprite.container
      .setPosition(drawX, drawY)
      .setAlpha(0.55)
      .setVisible(true)
      .setScale(this.playerSprite.container.scaleX, this.playerSprite.container.scaleY);
    this.setGlyphSpritePose(sprite, pose, snapshot.drawW, snapshot.drawH);
    this.setGlyphSpriteColors(sprite, COLORS.playerBody, color);

    this.afterimages.push({
      sprite,
      life: 0.14,
      maxLife: 0.14,
    });
  }

  private getAfterimageSprite(): GlyphSprite {
    const sprite = this.afterimagePool.pop();
    if (sprite) {
      return sprite;
    }

    const created = this.createGlyphSprite(4);
    created.container.setVisible(false);
    return created;
  }

  private squash(scaleX: number, scaleY: number): void {
    this.playerSprite.container.setScale(Math.abs(scaleX) * this.facing, scaleY);
  }

  private applyFastFallScale(snapshot: PlayerSnapshot): void {
    if (snapshot.onGround || !snapshot.isFastFalling) return;

    const maxFall = PLAYER_CONFIG.gravity.maxFall;
    const fastMaxFall = PLAYER_CONFIG.gravity.fastMaxFall;
    const half =
      maxFall + (fastMaxFall - maxFall) * PLAYER_VISUALS.fastFallScaleStartRatio;
    if (snapshot.vy < half) return;

    const lerp = Phaser.Math.Clamp((snapshot.vy - half) / (fastMaxFall - half), 0, 1);
    this.squash(
      Phaser.Math.Linear(1, PLAYER_VISUALS.fastFallScaleMinX, lerp),
      Phaser.Math.Linear(1, PLAYER_VISUALS.fastFallScaleMaxY, lerp),
    );
  }

  private processDuckStateTransition(snapshot: PlayerSnapshot): void {
    if (this.prevCrouched === null) return;

    const enteredDuck =
      !this.prevCrouched &&
      snapshot.isCrouched &&
      snapshot.onGround;
    if (enteredDuck) {
      this.squash(PLAYER_VISUALS.duckSquashX, PLAYER_VISUALS.duckSquashY);
      return;
    }

    const exitedDuck =
      this.prevCrouched &&
      !snapshot.isCrouched &&
      this.prevOnGround &&
      snapshot.onGround;
    if (exitedDuck) {
      this.squash(PLAYER_VISUALS.unduckSquashX, PLAYER_VISUALS.unduckSquashY);
    }
  }

  private relaxScale(dt: number): void {
    const delta = PLAYER_VISUALS.scaleRelaxRate * dt;
    this.playerSprite.container.scaleX = this.approach(
      this.playerSprite.container.scaleX,
      this.facing,
      delta,
    );
    this.playerSprite.container.scaleY = this.approach(
      this.playerSprite.container.scaleY,
      1,
      delta,
    );
  }

  private approach(current: number, target: number, maxDelta: number): number {
    return current < target
      ? Math.min(current + maxDelta, target)
      : Math.max(current - maxDelta, target);
  }

  private emitJumpDust(snapshot: PlayerSnapshot, count: number): void {
    this.emitLandDust(snapshot, count);
  }

  private emitLandDust(snapshot: PlayerSnapshot, count: number): void {
    const px = snapshot.centerX;
    const py = snapshot.bottom;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private emitWallJumpDust(snapshot: PlayerSnapshot, wallDir: number, count: number): void {
    const dir = wallDir === 0 ? snapshot.facing : wallDir;
    const px = dir < 0 ? snapshot.left - 1 : snapshot.right + 1;
    const py = snapshot.centerY;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private emitWallSlideDust(snapshot: PlayerSnapshot, wallDir: number, count: number): void {
    const dir = wallDir === 0 ? snapshot.facing : wallDir;
    const px = dir < 0 ? snapshot.left - 1 : snapshot.right + 1;
    const py = snapshot.bottom - 2;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private resolveBodyColor(snapshot: PlayerSnapshot): number {
    return snapshot.isTired && this.isTiredFlashVisible()
      ? COLORS.playerTiredFlash
      : COLORS.playerBody;
  }

  private resolveHairColor(snapshot: PlayerSnapshot): number {
    return snapshot.hairColor;
  }

  private isTiredFlashVisible(): boolean {
    const intervalMs = PLAYER_VISUALS.tiredFlashInterval * 1000;
    return Math.floor(this.scene.time.now / intervalMs) % 2 === 1;
  }

  private captureDashVisuals(snapshot: PlayerSnapshot, effect: PlayerEffect): void {
    this.dashTrailColor = effect.dashColor ?? snapshot.hairColor;
    this.dashEmitter.setParticleTint(this.dashTrailColor);

    const dx = effect.dirX ?? snapshot.facing;
    const dy = effect.dirY ?? 0;
    const len = Math.hypot(dx, dy);
    this.dashDirX = len > 0.0001 ? dx / len : snapshot.facing;
    this.dashDirY = len > 0.0001 ? dy / len : 0;

    const baseSpeed = 70;
    const spread = 55;
    const xBias = this.dashDirX * baseSpeed;
    const yBias = this.dashDirY * baseSpeed;
    this.dashEmitter.speedX = { min: xBias - spread, max: xBias + spread };
    this.dashEmitter.speedY = { min: yBias - spread, max: yBias + spread };
  }

  private emitDashBeginBurst(snapshot: PlayerSnapshot): void {
    const cx = snapshot.centerX;
    const cy = snapshot.centerY;
    this.dashEmitter.speedX = { min: -90, max: 90 };
    this.dashEmitter.speedY = { min: -90, max: 90 };
    this.dashEmitter.emitParticleAt(cx, cy, 1);
  }

  private emitDashCommitBurst(snapshot: PlayerSnapshot): void {
    const cx = snapshot.centerX;
    const cy = snapshot.centerY;
    const baseSpeed = 120;
    const spread = 45;
    const xBias = this.dashDirX * baseSpeed;
    const yBias = this.dashDirY * baseSpeed;
    this.dashEmitter.speedX = { min: xBias - spread, max: xBias + spread };
    this.dashEmitter.speedY = { min: yBias - spread, max: yBias + spread };
    this.dashEmitter.emitParticleAt(cx, cy, 2);
  }

  private emitDashSlash(snapshot: PlayerSnapshot): void {
    const cx = snapshot.centerX;
    const cy = snapshot.centerY;
    this.dashSlashTimer = PLAYER_VISUALS.dashSlashLife;
    this.dashSlash
      .setPosition(cx, cy)
      .setAngle(Phaser.Math.RadToDeg(Math.atan2(this.dashDirY, this.dashDirX)))
      .setFillStyle(COLORS.dust, 1)
      .setAlpha(0.85)
      .setScale(1, 1.1)
      .setVisible(true);
  }

  private addCameraImpulse(x: number, y: number): void {
    const scene = this.scene as Phaser.Scene & { addCameraImpulse?: (ix: number, iy: number) => void };
    scene.addCameraImpulse?.(x, y);
  }

  private ensurePixelTexture(): void {
    if (this.scene.textures.exists("pixel")) return;

    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture("pixel", 2, 2);
    g.destroy();
  }

  private ensureGlyphTextures(): void {
    for (const pose of Object.keys(SQRT11_GLYPHS) as Sqrt11Pose[]) {
      this.ensureGlyphTexture(pose, "body", SQRT11_GLYPHS[pose].bodyRows);
      this.ensureGlyphTexture(pose, "hair", SQRT11_GLYPHS[pose].hairRows);
    }
  }

  private ensureGlyphTexture(
    pose: Sqrt11Pose,
    layer: "body" | "hair",
    rows: readonly (readonly PixelRun[])[],
  ): void {
    const key = this.glyphTextureKey(pose, layer);
    if (this.scene.textures.exists(key)) return;

    const glyph = SQRT11_GLYPHS[pose];
    const g = this.scene.add.graphics();
    this.drawGlyphRows(g, rows, 0, 0, 1, 1, 0xffffff, 1);
    g.generateTexture(key, glyph.width, glyph.height);
    g.destroy();
  }

  private createGlyphSprite(depth: number): GlyphSprite {
    const body = this.scene.add.image(0, 0, this.glyphTextureKey("idle", "body")).setOrigin(0.5, 1);
    const hair = this.scene.add.image(0, 0, this.glyphTextureKey("idle", "hair")).setOrigin(0.5, 1);
    const container = this.scene.add.container(0, 0, [body, hair]).setDepth(depth);
    return { container, body, hair };
  }

  private destroyGlyphSprite(sprite: GlyphSprite): void {
    sprite.body.destroy();
    sprite.hair.destroy();
    sprite.container.destroy();
  }

  private syncFacing(facing: PlayerSnapshot["facing"]): void {
    this.facing = facing;
    this.playerSprite.container.scaleX = Math.abs(this.playerSprite.container.scaleX) * facing;
  }

  private resolveSqrt11Pose(snapshot: PlayerSnapshot): Sqrt11Pose {
    return snapshot.isCrouched ? "duck" : "idle";
  }

  private applyGlyphSprite(
    sprite: GlyphSprite,
    pose: Sqrt11Pose,
    x: number,
    y: number,
    w: number,
    h: number,
    bodyColor: number,
    hairColor: number,
  ): void {
    sprite.container.setPosition(x, y);
    this.setGlyphSpritePose(sprite, pose, w, h);
    this.setGlyphSpriteColors(sprite, bodyColor, hairColor);
  }

  private setGlyphSpritePose(sprite: GlyphSprite, pose: Sqrt11Pose, w: number, h: number): void {
    sprite.body
      .setTexture(this.glyphTextureKey(pose, "body"))
      .setDisplaySize(w, h);
    sprite.hair
      .setTexture(this.glyphTextureKey(pose, "hair"))
      .setDisplaySize(w, h);
  }

  private setGlyphSpriteColors(sprite: GlyphSprite, bodyColor: number, hairColor: number): void {
    sprite.body.setTint(bodyColor);
    sprite.hair.setTint(hairColor);
  }

  private glyphTextureKey(pose: Sqrt11Pose, layer: "body" | "hair"): string {
    return `sqrt11-${pose}-${layer}`;
  }

  private drawGlyphRows(
    g: Phaser.GameObjects.Graphics,
    rows: readonly (readonly PixelRun[])[],
    left: number,
    top: number,
    pixelW: number,
    pixelH: number,
    color: number,
    alpha: number,
  ): void {
    g.fillStyle(color, alpha);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const y = top + rowIndex * pixelH;
      for (const [startX, runWidth] of row) {
        g.fillRect(left + startX * pixelW, y, runWidth * pixelW, pixelH);
      }
    }
  }

}
