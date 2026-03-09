import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, PLAYER_VISUALS } from "../constants";
import { PlayerEffect, PlayerSnapshot } from "../player/types";

interface Afterimage {
  rect: Phaser.GameObjects.Rectangle;
  life: number;
  maxLife: number;
}

export class PlayerView {
  private scene: Phaser.Scene;
  private body: Phaser.GameObjects.Rectangle;
  private dashSlash: Phaser.GameObjects.Rectangle;
  private afterimages: Afterimage[] = [];
  private afterimagePool: Phaser.GameObjects.Rectangle[] = [];
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
  private tiredFlashTimer = PLAYER_VISUALS.tiredFlashInterval;
  private tiredFlash = false;

  private dashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private wallEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensurePixelTexture();

    this.body = this.scene.add
      .rectangle(0, 0, PLAYER_GEOMETRY.drawW, PLAYER_GEOMETRY.drawH, COLORS.playerOneDash)
      .setOrigin(0.5, 1)
      .setDepth(5);

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
    this.updateTiredFlash(dt);
    this.applyFastFallScale(snapshot);
    this.processEffects(snapshot, effects);
    this.processDuckStateTransition(snapshot);
    this.relaxScale(dt);
    this.updateAfterimages(dt);
    this.updateDashSlash(dt);
    this.updateTrail(snapshot, dt);

    const drawX = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const drawY = snapshot.y + snapshot.hitboxH;

    this.body.setSize(snapshot.drawW, snapshot.drawH);
    this.body.setPosition(drawX, drawY);
    this.body.setFillStyle(this.resolveColor(snapshot), 1);

    this.prevCrouched = snapshot.isCrouched;
    this.prevOnGround = snapshot.onGround;
    this.prevState = snapshot.state;
  }

  destroy(): void {
    this.body.destroy();
    this.dashSlash.destroy();
    this.dashEmitter.destroy();
    this.wallEmitter.destroy();

    for (const a of this.afterimages) {
      a.rect.destroy();
    }
    for (const rect of this.afterimagePool) {
      rect.destroy();
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

      const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
      const cy = snapshot.y + snapshot.hitboxH / 2;
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
        a.rect.setVisible(false);
        this.afterimagePool.push(a.rect);
        this.afterimages[i] = this.afterimages[this.afterimages.length - 1];
        this.afterimages.pop();
        continue;
      }

      a.rect.alpha = a.life / a.maxLife;
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
    const drawX = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const drawY = snapshot.y + snapshot.hitboxH;
    const rect = this.getAfterimageRect(snapshot.drawW, snapshot.drawH);

    rect
      .setPosition(drawX, drawY)
      .setFillStyle(color, 1)
      .setAlpha(0.55)
      .setVisible(true);

    this.afterimages.push({
      rect,
      life: 0.14,
      maxLife: 0.14,
    });
  }

  private getAfterimageRect(drawW: number, drawH: number): Phaser.GameObjects.Rectangle {
    const rect = this.afterimagePool.pop();
    if (rect) {
      rect.setSize(drawW, drawH);
      return rect;
    }

    return this.scene.add
      .rectangle(0, 0, drawW, drawH, COLORS.playerCooldown)
      .setOrigin(0.5, 1)
      .setDepth(4)
      .setVisible(false);
  }

  private squash(scaleX: number, scaleY: number): void {
    this.body.setScale(scaleX, scaleY);
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
      snapshot.onGround &&
      snapshot.state === "duck";
    if (enteredDuck) {
      this.squash(PLAYER_VISUALS.duckSquashX, PLAYER_VISUALS.duckSquashY);
      return;
    }

    const exitedDuck =
      this.prevCrouched &&
      !snapshot.isCrouched &&
      this.prevOnGround &&
      this.prevState === "duck" &&
      snapshot.onGround;
    if (exitedDuck) {
      this.squash(PLAYER_VISUALS.unduckSquashX, PLAYER_VISUALS.unduckSquashY);
    }
  }

  private relaxScale(dt: number): void {
    const delta = PLAYER_VISUALS.scaleRelaxRate * dt;
    this.body.scaleX = this.approach(this.body.scaleX, 1, delta);
    this.body.scaleY = this.approach(this.body.scaleY, 1, delta);
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
    const px = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const py = snapshot.y + snapshot.hitboxH;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private emitWallJumpDust(snapshot: PlayerSnapshot, wallDir: number, count: number): void {
    const dir = wallDir === 0 ? snapshot.facing : wallDir;
    const px = dir < 0 ? snapshot.x - 1 : snapshot.x + PLAYER_GEOMETRY.hitboxW + 1;
    const py = snapshot.y + snapshot.hitboxH * 0.5;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private emitWallSlideDust(snapshot: PlayerSnapshot, wallDir: number, count: number): void {
    const dir = wallDir === 0 ? snapshot.facing : wallDir;
    const px = dir < 0 ? snapshot.x - 1 : snapshot.x + PLAYER_GEOMETRY.hitboxW + 1;
    const py = snapshot.y + snapshot.hitboxH - 2;
    this.wallEmitter.emitParticleAt(px, py, count);
  }

  private resolveColor(snapshot: PlayerSnapshot): number {
    const isTired = snapshot.stamina <= PLAYER_CONFIG.climb.tiredThreshold;
    if (isTired) {
      return this.tiredFlash ? COLORS.playerTiredFlash : COLORS.playerCooldown;
    }

    if (snapshot.dashCooldownActive) {
      return COLORS.playerCooldown;
    }

    return this.resolveHairColorByDashCount(snapshot.dashesLeft);
  }

  private updateTiredFlash(dt: number): void {
    this.tiredFlashTimer -= dt;
    while (this.tiredFlashTimer <= 0) {
      this.tiredFlash = !this.tiredFlash;
      this.tiredFlashTimer += PLAYER_VISUALS.tiredFlashInterval;
    }
  }

  private resolveHairColorByDashCount(dashesLeft: number): number {
    if (dashesLeft <= 0) return COLORS.playerNoDash;
    if (dashesLeft === 1) return COLORS.playerOneDash;
    if (dashesLeft === 2) return COLORS.playerTwoDash;
    return COLORS.playerManyDash;
  }

  private captureDashVisuals(snapshot: PlayerSnapshot, effect: PlayerEffect): void {
    this.dashTrailColor = this.resolveHairColorByDashCount(snapshot.dashesLeft);
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
    const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const cy = snapshot.y + snapshot.hitboxH * 0.5;
    this.dashEmitter.speedX = { min: -90, max: 90 };
    this.dashEmitter.speedY = { min: -90, max: 90 };
    this.dashEmitter.emitParticleAt(cx, cy, 1);
  }

  private emitDashCommitBurst(snapshot: PlayerSnapshot): void {
    const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const cy = snapshot.y + snapshot.hitboxH * 0.5;
    const baseSpeed = 120;
    const spread = 45;
    const xBias = this.dashDirX * baseSpeed;
    const yBias = this.dashDirY * baseSpeed;
    this.dashEmitter.speedX = { min: xBias - spread, max: xBias + spread };
    this.dashEmitter.speedY = { min: yBias - spread, max: yBias + spread };
    this.dashEmitter.emitParticleAt(cx, cy, 2);
  }

  private emitDashSlash(snapshot: PlayerSnapshot): void {
    const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const cy = snapshot.y + snapshot.hitboxH * 0.5;
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
}
