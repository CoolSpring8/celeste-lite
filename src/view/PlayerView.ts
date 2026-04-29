import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_VISUALS } from "../constants";
import type { PlayerIntroStateSnapshot } from "../player/intro";
import { PlayerEffect, PlayerSnapshot, PlayerSweatState } from "../player/types";
import { sampleDeathEffect } from "./deathEffect";
import {
  resolveHairLayout,
  snapHairChain,
  SQRT11_HAIR_RADII,
  stepHairChain,
  type HairPoint,
  type Sqrt11Pose,
} from "./playerHair";
import { sampleStartIntro } from "./startIntro";

type PixelRun = readonly [x: number, width: number];

interface PixelGlyph {
  width: number;
  height: number;
  bangRows: readonly (readonly PixelRun[])[];
  bodyRows: readonly (readonly PixelRun[])[];
}

interface LegacyPixelGlyph {
  width: number;
  height: number;
  hairRows: readonly (readonly PixelRun[])[];
  bodyRows: readonly (readonly PixelRun[])[];
}

const SQRT11_GLYPHS: Record<Sqrt11Pose, PixelGlyph> = {
  idle: {
    width: 8,
    height: 11,
    bangRows: [
      [],
      [[2, 6]],
      [[2, 6]],
      [[2, 1]],
      [[2, 1]],
      [],
      [],
      [],
      [],
      [],
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
    bangRows: [
      [[2, 5]],
      [[2, 2]],
      [[2, 1]],
      [],
      [],
      [],
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

const LEGACY_SQRT11_GLYPHS: Record<Sqrt11Pose, LegacyPixelGlyph> = {
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
  bangs: Phaser.GameObjects.Image;
  legacyHair: Phaser.GameObjects.Image;
  sweat: Phaser.GameObjects.Image;
  hairNodes: Phaser.GameObjects.Image[];
  hairPoints: HairPoint[];
}

interface DeathFlashState {
  x: number;
  y: number;
  color: number;
  life: number;
  maxLife: number;
}

interface DeathRecoilState {
  x: number;
  y: number;
  scale: number;
}

const RESPAWN_RECONSTRUCTION_VISUALS = {
  burstSpeed: 22,
  burstSpread: 14,
  startRadiusXScale: 0.9,
  startRadiusYScale: 0.8,
  endRadiusXScale: 0.24,
  endRadiusYScale: 0.2,
  minRadiusX: 10,
  minRadiusY: 8,
  minEndRadius: 2,
  startVelocityMult: 3.2,
  endVelocityMult: 2.2,
  velocityJitter: 0.14,
} as const;

const HAIR_NODE_GLYPHS = {
  thin: {
    width: 3,
    height: 3,
    rows: [
      [[1, 1]],
      [[0, 3]],
      [[1, 1]],
    ] as const,
  },
} as const;

const SWEAT_ANIMATION_INTERVAL_MS = 120;

interface SweatGlyph {
  width: number;
  height: number;
  frames: readonly (readonly (readonly PixelRun[])[])[];
  loop: boolean;
}

const SWEAT_GLYPHS: Record<PlayerSweatState, SweatGlyph> = {
  idle: {
    width: 8,
    height: 11,
    frames: [[
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]] as const,
    loop: false,
  },
  still: {
    width: 8,
    height: 11,
    frames: [
      [
        [],
        [],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      [
        [],
        [],
        [[3, 1]],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    ] as const,
    loop: true,
  },
  climb: {
    width: 8,
    height: 11,
    frames: [
      [
        [],
        [],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      [
        [],
        [],
        [[3, 1]],
        [[3, 1]],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    ] as const,
    loop: true,
  },
  danger: {
    width: 8,
    height: 11,
    frames: [
      [
        [],
        [],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      [
        [],
        [],
        [[3, 2]],
        [[3, 1]],
        [[3, 1]],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    ] as const,
    loop: true,
  },
  jump: {
    width: 8,
    height: 11,
    frames: [[
      [],
      [],
      [[3, 1]],
      [[3, 1]],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]] as const,
    loop: false,
  },
} as const;

export class PlayerView {
  private scene: Phaser.Scene;
  private playerSprite: GlyphSprite;
  private respawnSprite: GlyphSprite;
  private dynamicHairEnabled = false;
  private dashSlash: Phaser.GameObjects.Rectangle;
  private deathFlash: Phaser.GameObjects.Ellipse;
  private deathRecoilOrb: Phaser.GameObjects.Ellipse;
  private respawnAura: Phaser.GameObjects.Ellipse;
  private respawnCore: Phaser.GameObjects.Ellipse;
  private afterimages: Afterimage[] = [];
  private afterimagePool: GlyphSprite[] = [];
  private dashParticleTimer = 0;
  private dashSlashTimer = 0;
  private wallDustTimer = 0;
  private dashTrailColor: number = COLORS.playerOneDash;
  private dashDirX = 1;
  private dashDirY = 0;
  private introSparkTimer = 0;
  private hideLiveSprite = false;
  private deathFlashState: DeathFlashState | null = null;
  private deathRecoil: DeathRecoilState | null = null;
  private activeIntroType: PlayerIntroStateSnapshot["type"] | null = null;
  private prevCrouched: boolean | null = null;
  private prevOnGround = false;
  private facing: PlayerSnapshot["facing"] = 1;

  private dashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private wallEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private deathEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private respawnEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensurePixelTexture();
    this.ensureGlyphTextures();
    this.ensureHairNodeTextures();
    this.ensureSweatTextures();

    this.playerSprite = this.createGlyphSprite(5);
    this.respawnSprite = this.createGlyphSprite(6);
    this.respawnSprite.container.setVisible(false);

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

    this.deathFlash = this.scene.add
      .ellipse(0, 0, PLAYER_VISUALS.deathFlashSize, PLAYER_VISUALS.deathFlashSize, 0xffffff, 1)
      .setDepth(6)
      .setVisible(false);

    this.deathRecoilOrb = this.scene.add
      .ellipse(0, 0, 6, 6, 0xffffff, 1)
      .setDepth(7)
      .setVisible(false);

    this.respawnAura = this.scene.add
      .ellipse(0, 0, 16, 16, COLORS.dust, 1)
      .setDepth(5)
      .setVisible(false);

    this.respawnCore = this.scene.add
      .ellipse(0, 0, 10, 10, COLORS.dust, 1)
      .setDepth(6)
      .setVisible(false);

    this.dashEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: PLAYER_VISUALS.dashParticleSpeedMin, max: PLAYER_VISUALS.dashParticleSpeedMax },
      lifespan: {
        min: PLAYER_VISUALS.dashParticleLifeMinMs,
        max: PLAYER_VISUALS.dashParticleLifeMaxMs,
      },
      quantity: 0,
      scale: PLAYER_VISUALS.dashParticleScale,
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

    this.deathEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: 24, max: 110 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 420 },
      quantity: 0,
      scale: { start: 1.1, end: 0.05 },
      alpha: { start: 0.9, end: 0 },
      gravityY: 8,
      emitting: false,
      blendMode: "NORMAL",
    });
    this.deathEmitter.setDepth(6);

    this.respawnEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: 8, max: 42 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 420 },
      quantity: 0,
      scale: { start: 0.85, end: 0.05 },
      alpha: { start: 0.95, end: 0 },
      gravityY: -6,
      emitting: false,
      blendMode: "NORMAL",
    });
    this.respawnEmitter.setDepth(6);
  }

  setDynamicHairEnabled(enabled: boolean): void {
    this.dynamicHairEnabled = enabled;
  }

  setSolidOcclusionMask(mask: Phaser.Display.Masks.GeometryMask): void {
    this.playerSprite.container.setMask(mask);
  }

  tick(snapshot: PlayerSnapshot, effects: PlayerEffect[], dt: number): void {
    this.syncFacing(snapshot.facing);
    this.applyFastFallScale(snapshot);
    this.updateGlyphHairState(
      this.playerSprite,
      snapshot,
      dt,
      snapshot.justRespawned ? "snap" : "simulate",
    );
    this.updateIntroEffects(snapshot, dt);
    this.processEffects(snapshot, effects);
    this.processDuckStateTransition(snapshot);
    this.relaxScale(dt);
    this.updateAfterimages(dt);
    this.updateDashSlash(dt);
    this.updateTrail(snapshot, dt);

    this.prevCrouched = snapshot.isCrouched;
    this.prevOnGround = snapshot.onGround;
  }

  render(snapshot: PlayerSnapshot): void {
    this.syncFacing(snapshot.facing);
    this.renderIntro(snapshot);

    const drawX = snapshot.x;
    const drawY = snapshot.y;
    const pose = this.resolveSqrt11Pose(snapshot);

    if (this.hideLiveSprite || snapshot.dead || snapshot.intro !== null) {
      this.playerSprite.container.setVisible(false);
      return;
    }

    this.playerSprite.container.setVisible(true);
    this.applyGlyphSprite(
      this.playerSprite,
      pose,
      drawX,
      drawY,
      snapshot.drawW,
      snapshot.drawH,
      this.resolveBodyColor(snapshot),
      this.resolveHairColor(snapshot),
      snapshot.sweatState,
    );
  }

  destroy(): void {
    this.destroyGlyphSprite(this.playerSprite);
    this.destroyGlyphSprite(this.respawnSprite);
    this.dashSlash.destroy();
    this.deathFlash.destroy();
    this.deathRecoilOrb.destroy();
    this.respawnAura.destroy();
    this.respawnCore.destroy();
    this.dashEmitter.destroy();
    this.wallEmitter.destroy();
    this.deathEmitter.destroy();
    this.respawnEmitter.destroy();

    for (const a of this.afterimages) {
      this.destroyGlyphSprite(a.sprite);
    }
    for (const sprite of this.afterimagePool) {
      this.destroyGlyphSprite(sprite);
    }

    this.afterimages = [];
    this.afterimagePool = [];
  }

  advanceDeathRespawn(dt: number): void {
    this.updateDeathRecoilVisual();
    this.updateDeathFlash(dt);
  }

  resetDeathRespawn(): void {
    this.hideLiveSprite = false;
    this.deathFlashState = null;
    this.deathRecoil = null;
    this.activeIntroType = null;
    this.introSparkTimer = 0;
    this.deathFlash.setVisible(false);
    this.deathRecoilOrb.setVisible(false);
    this.respawnAura.setVisible(false);
    this.respawnCore.setVisible(false);
    this.respawnSprite.container.setVisible(false);
  }

  pauseEffects(): void {
    this.dashEmitter.pause();
    this.wallEmitter.pause();
    this.deathEmitter.pause();
    this.respawnEmitter.pause();
  }

  resumeEffects(): void {
    this.dashEmitter.resume();
    this.wallEmitter.resume();
    this.deathEmitter.resume();
    this.respawnEmitter.resume();
  }

  startDeath(snapshot: PlayerSnapshot): void {
    this.startDeathAt(snapshot, snapshot.centerX, snapshot.centerY);
  }

  startDeathAt(snapshot: PlayerSnapshot, centerX: number, centerY: number): void {
    this.hideLiveSprite = true;
    this.clearAfterimages();
    this.deathRecoil = null;
    this.deathRecoilOrb.setVisible(false);
    this.deathFlashState = {
      x: centerX,
      y: centerY,
      color: snapshot.hairColor,
      life: PLAYER_VISUALS.deathFlashLife,
      maxLife: PLAYER_VISUALS.deathFlashLife,
    };
    this.deathFlash
      .setPosition(centerX, centerY)
      .setFillStyle(snapshot.hairColor, PLAYER_VISUALS.deathFlashStartAlpha)
      .setScale(PLAYER_VISUALS.deathFlashStartScale)
      .setVisible(true);

    this.emitDeathBurst(snapshot, centerX, centerY);
  }

  startDeathRecoil(snapshot: PlayerSnapshot): void {
    this.hideLiveSprite = true;
    this.clearAfterimages();
    this.deathFlashState = null;
    this.deathFlash.setVisible(false);
    this.deathRecoil = {
      x: snapshot.centerX,
      y: snapshot.centerY,
      scale: 1,
    };
    this.updateDeathRecoilVisual();
  }

  setDeathRecoilPosition(x: number, y: number, progress: number): void {
    if (this.deathRecoil === null) {
      return;
    }

    this.deathRecoil.x = x;
    this.deathRecoil.y = y;
    this.deathRecoil.scale = Phaser.Math.Linear(1, 0.56, Phaser.Math.Clamp(progress, 0, 1));
    this.updateDeathRecoilVisual();
  }

  private processEffects(snapshot: PlayerSnapshot, effects: PlayerEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "bounce":
          this.squash(PLAYER_VISUALS.jumpSquashX, PLAYER_VISUALS.jumpSquashY);
          break;
        case "dash_begin":
          this.captureDashVisuals(snapshot, effect);
          this.squash(0.72, 1.28);
          break;
        case "dash_trail":
          this.spawnAfterimageEffect(effect);
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
          this.shakeCamera(70, 0.003);
          break;
        case "respawn_pop":
          this.squash(1.5, 0.5);
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

    const dashActive = this.isDashActive(snapshot);

    if (!dashActive) {
      this.dashParticleTimer = 0;
      return;
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

  private updateDeathFlash(dt: number): void {
    const state = this.deathFlashState;
    if (state === null) {
      this.deathFlash.setVisible(false);
      return;
    }

    state.life = Math.max(0, state.life - dt);
    const life = state.maxLife > 0 ? state.life / state.maxLife : 0;
    const progress = 1 - life;

    this.deathFlash
      .setVisible(state.life > 0)
      .setPosition(state.x, state.y)
      .setFillStyle(
        state.color,
        Phaser.Math.Linear(
          PLAYER_VISUALS.deathFlashStartAlpha,
          PLAYER_VISUALS.deathFlashEndAlpha,
          progress,
        ),
      )
      .setScale(
        Phaser.Math.Linear(
          PLAYER_VISUALS.deathFlashStartScale,
          PLAYER_VISUALS.deathFlashEndScale,
          progress,
        ),
      );

    if (state.life <= 0) {
      this.deathFlashState = null;
      this.deathFlash.setVisible(false);
    }
  }

  private updateDeathRecoilVisual(): void {
    const recoil = this.deathRecoil;
    if (recoil === null) {
      this.deathRecoilOrb.setVisible(false);
      return;
    }

    this.deathRecoilOrb
      .setVisible(true)
      .setPosition(recoil.x, recoil.y)
      .setFillStyle(0xffffff, 1)
      .setScale(recoil.scale);
  }

  private updateIntroEffects(snapshot: PlayerSnapshot, dt: number): void {
    const introType = snapshot.intro?.type ?? null;
    if (introType !== this.activeIntroType) {
      if (this.activeIntroType !== null) {
        this.emitRespawnBurst(
          snapshot.centerX,
          snapshot.centerY,
          PLAYER_VISUALS.respawnSparkCount,
          snapshot.hairColor,
        );
      }
      this.activeIntroType = introType;
      this.introSparkTimer = 0;
      if (introType === "start") {
        this.emitRespawnBurst(
          snapshot.centerX,
          snapshot.centerY,
          Math.max(3, Math.round(PLAYER_VISUALS.respawnSparkCount * 0.4)),
          snapshot.hairColor,
        );
      } else if (introType === "respawn" && snapshot.intro !== null) {
        this.emitRespawnReconstructionParticles(snapshot, snapshot.intro, 4);
      }
    }

    if (snapshot.intro === null) {
      return;
    }

    this.introSparkTimer -= dt;
    if (this.introSparkTimer > 0) {
      return;
    }

    this.introSparkTimer = PLAYER_VISUALS.respawnSparkInterval;
    if (snapshot.intro.type === "start") {
      const sample = sampleStartIntro(snapshot.intro.progress);
      this.emitRespawnBurst(
        snapshot.centerX,
        snapshot.y - snapshot.drawH * (1 - sample.ghostScaleY) * 0.18,
        1,
        snapshot.hairColor,
      );
      return;
    }

    this.emitRespawnReconstructionParticles(snapshot, snapshot.intro, 1);
  }

  private renderIntro(snapshot: PlayerSnapshot): void {
    if (snapshot.intro === null) {
      this.hideIntroVisuals();
      return;
    }

    if (snapshot.intro.type === "respawn") {
      this.renderDeathEffect(snapshot, snapshot.intro);
      return;
    }

    this.renderStartIntro(snapshot, snapshot.intro);
  }

  private renderDeathEffect(snapshot: PlayerSnapshot, intro: PlayerIntroStateSnapshot): void {
    const effect = sampleDeathEffect(intro, snapshot.centerX, snapshot.centerY);

    this.respawnSprite.container.setVisible(false);
    this.respawnAura
      .setVisible(effect.auraAlpha > 0.001)
      .setPosition(effect.x, effect.y)
      .setFillStyle(snapshot.hairColor, effect.auraAlpha)
      .setScale(effect.auraScale);

    this.respawnCore
      .setVisible(effect.coreAlpha > 0.001)
      .setPosition(effect.x, effect.y)
      .setFillStyle(COLORS.dust, effect.coreAlpha)
      .setScale(effect.coreScale);
  }

  private renderStartIntro(snapshot: PlayerSnapshot, intro: PlayerIntroStateSnapshot): void {
    const sample = sampleStartIntro(intro.progress);
    const x = snapshot.x;
    const y = snapshot.y;

    this.updateGlyphHairState(this.respawnSprite, snapshot, 0, "snap");
    this.applyGlyphSprite(
      this.respawnSprite,
      this.resolveSqrt11Pose(snapshot),
      x,
      y,
      snapshot.drawW,
      snapshot.drawH,
      this.resolveBodyColor(snapshot),
      this.resolveHairColor(snapshot),
    );
    this.respawnSprite.container
      .setVisible(true)
      .setAlpha(sample.ghostAlpha)
      .setScale(sample.ghostScaleX, sample.ghostScaleY);

    this.respawnAura
      .setVisible(sample.auraAlpha > 0.001)
      .setPosition(x, y)
      .setFillStyle(snapshot.hairColor, sample.auraAlpha)
      .setScale(sample.auraScale);

    this.respawnCore
      .setVisible(sample.coreAlpha > 0.001)
      .setPosition(x, y)
      .setFillStyle(COLORS.dust, sample.coreAlpha)
      .setScale(sample.coreScale);
  }

  private hideIntroVisuals(): void {
    this.respawnAura.setVisible(false);
    this.respawnCore.setVisible(false);
    this.respawnSprite.container.setVisible(false);
  }

  private spawnAfterimage(snapshot: PlayerSnapshot, color: number): void {
    this.spawnAfterimageFrame(
      snapshot.x,
      snapshot.y,
      this.resolveSqrt11Pose(snapshot),
      snapshot.drawW,
      snapshot.drawH,
      color,
    );
  }

  private spawnAfterimageEffect(effect: PlayerEffect): void {
    if (
      effect.trailX === undefined ||
      effect.trailY === undefined ||
      effect.trailDrawW === undefined ||
      effect.trailDrawH === undefined
    ) {
      return;
    }

    this.spawnAfterimageFrame(
      effect.trailX,
      effect.trailY,
      effect.trailCrouched ? "duck" : "idle",
      effect.trailDrawW,
      effect.trailDrawH,
      effect.dashColor ?? this.dashTrailColor,
    );
  }

  private spawnAfterimageFrame(
    x: number,
    y: number,
    pose: Sqrt11Pose,
    drawW: number,
    drawH: number,
    color: number,
  ): void {
    const sprite = this.getAfterimageSprite();

    sprite.container
      .setPosition(x, y)
      .setAlpha(0.55)
      .setVisible(true)
      .setScale(this.playerSprite.container.scaleX, this.playerSprite.container.scaleY);
    this.copyGlyphHairState(this.playerSprite, sprite);
    this.applyGlyphSprite(
      sprite,
      pose,
      x,
      y,
      drawW,
      drawH,
      COLORS.playerBody,
      color,
    );

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
    this.playerSprite.container.setScale(Math.abs(scaleX), scaleY);
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
      1,
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

  private emitDeathBurst(snapshot: PlayerSnapshot, cx = snapshot.centerX, cy = snapshot.centerY): void {
    const count = PLAYER_VISUALS.deathParticleCount;

    this.deathEmitter.setParticleTint(snapshot.hairColor);
    this.deathEmitter.emitParticleAt(cx, cy, Math.ceil(count * 0.5));
    this.deathEmitter.setParticleTint(COLORS.playerBody);
    this.deathEmitter.emitParticleAt(cx, cy, Math.ceil(count * 0.3));
    this.deathEmitter.setParticleTint(COLORS.dust);
    this.deathEmitter.emitParticleAt(cx, cy, Math.floor(count * 0.2));
  }

  private emitRespawnBurst(x: number, y: number, count: number, tint: number): void {
    const speed = RESPAWN_RECONSTRUCTION_VISUALS.burstSpeed;
    const spread = RESPAWN_RECONSTRUCTION_VISUALS.burstSpread;
    this.respawnEmitter.setParticleTint(tint);
    this.respawnEmitter.speedX = { min: -speed - spread, max: speed + spread };
    this.respawnEmitter.speedY = { min: -speed - spread, max: speed + spread };
    this.respawnEmitter.emitParticleAt(x, y, count);
  }

  private emitRespawnReconstructionParticles(
    snapshot: PlayerSnapshot,
    intro: PlayerIntroStateSnapshot,
    count: number,
  ): void {
    const targetX = snapshot.centerX + intro.offsetX;
    const targetY = snapshot.centerY + intro.offsetY;
    const startRadiusX = Math.max(
      snapshot.drawW * RESPAWN_RECONSTRUCTION_VISUALS.startRadiusXScale,
      RESPAWN_RECONSTRUCTION_VISUALS.minRadiusX,
    );
    const startRadiusY = Math.max(
      snapshot.drawH * RESPAWN_RECONSTRUCTION_VISUALS.startRadiusYScale,
      RESPAWN_RECONSTRUCTION_VISUALS.minRadiusY,
    );
    const endRadiusX = Math.max(
      snapshot.drawW * RESPAWN_RECONSTRUCTION_VISUALS.endRadiusXScale,
      RESPAWN_RECONSTRUCTION_VISUALS.minEndRadius,
    );
    const endRadiusY = Math.max(
      snapshot.drawH * RESPAWN_RECONSTRUCTION_VISUALS.endRadiusYScale,
      RESPAWN_RECONSTRUCTION_VISUALS.minEndRadius,
    );
    const radiusX = Phaser.Math.Linear(startRadiusX, endRadiusX, intro.progress);
    const radiusY = Phaser.Math.Linear(startRadiusY, endRadiusY, intro.progress);
    const velocityMult = Phaser.Math.Linear(
      RESPAWN_RECONSTRUCTION_VISUALS.startVelocityMult,
      RESPAWN_RECONSTRUCTION_VISUALS.endVelocityMult,
      intro.progress,
    );

    this.respawnEmitter.setParticleTint(snapshot.hairColor);
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const px = targetX + Math.cos(angle) * radiusX;
      const py = targetY + Math.sin(angle) * radiusY;
      const baseVx = (targetX - px) * velocityMult;
      const baseVy = (targetY - py) * velocityMult;
      const vx = baseVx * Phaser.Math.FloatBetween(
        1 - RESPAWN_RECONSTRUCTION_VISUALS.velocityJitter,
        1 + RESPAWN_RECONSTRUCTION_VISUALS.velocityJitter,
      );
      const vy = baseVy * Phaser.Math.FloatBetween(
        1 - RESPAWN_RECONSTRUCTION_VISUALS.velocityJitter,
        1 + RESPAWN_RECONSTRUCTION_VISUALS.velocityJitter,
      );
      this.respawnEmitter.speedX = { min: vx, max: vx };
      this.respawnEmitter.speedY = { min: vy, max: vy };
      this.respawnEmitter.emitParticleAt(px, py, 1);
    }
  }

  private clearAfterimages(): void {
    this.dashParticleTimer = 0;
    this.dashSlashTimer = 0;
    this.dashSlash.setVisible(false);
    for (const afterimage of this.afterimages) {
      afterimage.sprite.container.setVisible(false);
      this.afterimagePool.push(afterimage.sprite);
    }
    this.afterimages = [];
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

  private shakeCamera(durationMs: number, intensity: number): void {
    const scene = this.scene as Phaser.Scene & {
      requestScreenShake?: (durationMs: number, intensity: number) => void;
    };
    scene.requestScreenShake?.(durationMs, intensity);
  }

  private ensurePixelTexture(): void {
    if (this.scene.textures.exists("pixel")) return;

    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture("pixel", 2, 2);
    g.destroy();
  }

  private ensureHairNodeTextures(): void {
    this.ensureHairNodeTexture("thin");
  }

  private ensureSweatTextures(): void {
    for (const state of Object.keys(SWEAT_GLYPHS) as PlayerSweatState[]) {
      for (let frame = 0; frame < SWEAT_GLYPHS[state].frames.length; frame++) {
        this.ensureSweatTexture(state, frame);
      }
    }
  }

  private ensureHairNodeTexture(size: keyof typeof HAIR_NODE_GLYPHS): void {
    const key = this.hairNodeTextureKey(size);
    if (this.scene.textures.exists(key)) return;

    const glyph = HAIR_NODE_GLYPHS[size];
    const g = this.scene.add.graphics();
    this.drawGlyphRows(g, glyph.rows, 0, 0, 1, 1, 0xffffff, 1);
    g.generateTexture(key, glyph.width, glyph.height);
    g.destroy();
  }

  private ensureGlyphTextures(): void {
    for (const pose of Object.keys(SQRT11_GLYPHS) as Sqrt11Pose[]) {
      this.ensureGlyphTexture(pose, "body", SQRT11_GLYPHS[pose].bodyRows);
      this.ensureGlyphTexture(pose, "bang", SQRT11_GLYPHS[pose].bangRows);
      this.ensureLegacyGlyphTexture(pose, "body", LEGACY_SQRT11_GLYPHS[pose].bodyRows);
      this.ensureLegacyGlyphTexture(pose, "hair", LEGACY_SQRT11_GLYPHS[pose].hairRows);
    }
  }

  private ensureGlyphTexture(
    pose: Sqrt11Pose,
    layer: "body" | "bang",
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

  private ensureLegacyGlyphTexture(
    pose: Sqrt11Pose,
    layer: "body" | "hair",
    rows: readonly (readonly PixelRun[])[],
  ): void {
    const key = this.legacyGlyphTextureKey(pose, layer);
    if (this.scene.textures.exists(key)) return;

    const glyph = LEGACY_SQRT11_GLYPHS[pose];
    const g = this.scene.add.graphics();
    this.drawGlyphRows(g, rows, 0, 0, 1, 1, 0xffffff, 1);
    g.generateTexture(key, glyph.width, glyph.height);
    g.destroy();
  }

  private ensureSweatTexture(state: PlayerSweatState, frame: number): void {
    const key = this.sweatTextureKey(state, frame);
    if (this.scene.textures.exists(key)) return;

    const glyph = SWEAT_GLYPHS[state];
    const g = this.scene.add.graphics();
    this.drawGlyphRows(g, glyph.frames[frame], 0, 0, 1, 1, 0xffffff, 1);
    g.generateTexture(key, glyph.width, glyph.height);
    g.destroy();
  }

  private createGlyphSprite(depth: number): GlyphSprite {
    const body = this.scene.add.image(0, 0, this.glyphTextureKey("idle", "body")).setOrigin(0.5, 1);
    const bangs = this.scene.add.image(0, 0, this.glyphTextureKey("idle", "bang")).setOrigin(0.5, 1);
    const legacyHair = this.scene.add.image(0, 0, this.legacyGlyphTextureKey("idle", "hair")).setOrigin(0.5, 1);
    const sweat = this.scene.add
      .image(0, 0, this.sweatTextureKey("idle", 0))
      .setOrigin(0.5, 1)
      .setTint(COLORS.dust)
      .setVisible(false);
    const hairNodes = SQRT11_HAIR_RADII.map(() =>
      this.scene.add
        .image(0, 0, this.hairNodeTextureKey("thin"))
        .setOrigin(0.5)
        .setTint(COLORS.playerOneDash),
    );
    const container = this.scene.add
      .container(0, 0, [...hairNodes, body, bangs, legacyHair, sweat])
      .setDepth(depth);

    return {
      container,
      body,
      bangs,
      legacyHair,
      sweat,
      hairNodes,
      hairPoints: snapHairChain(resolveHairLayout({
        facing: 1,
        isCrouched: false,
        onGround: true,
        state: "normal",
        vx: 0,
        vy: 0,
      })),
    };
  }

  private destroyGlyphSprite(sprite: GlyphSprite): void {
    sprite.body.destroy();
    sprite.bangs.destroy();
    sprite.legacyHair.destroy();
    sprite.sweat.destroy();
    for (const hairNode of sprite.hairNodes) {
      hairNode.destroy();
    }
    sprite.container.destroy();
  }

  private syncFacing(facing: PlayerSnapshot["facing"]): void {
    this.facing = facing;
  }

  private isDashActive(snapshot: PlayerSnapshot): boolean {
    return snapshot.state === "dash" &&
      (Math.abs(snapshot.vx) > 0.001 || Math.abs(snapshot.vy) > 0.001);
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
    sweatState: PlayerSweatState = "idle",
  ): void {
    sprite.container.setPosition(x, y);
    this.setGlyphSpritePose(sprite, pose, w, h);
    this.setGlyphSpriteFacing(sprite, this.facing);
    this.setGlyphSpriteColors(sprite, bodyColor, hairColor);
    this.setGlyphSweatState(sprite, sweatState);
    this.setGlyphHairPositions(sprite);
  }

  private setGlyphSpritePose(sprite: GlyphSprite, pose: Sqrt11Pose, w: number, h: number): void {
    sprite.body
      .setTexture(this.dynamicHairEnabled
        ? this.glyphTextureKey(pose, "body")
        : this.legacyGlyphTextureKey(pose, "body"))
      .setDisplaySize(w, h);
    sprite.bangs
      .setTexture(this.glyphTextureKey(pose, "bang"))
      .setDisplaySize(w, h);
    sprite.legacyHair
      .setTexture(this.legacyGlyphTextureKey(pose, "hair"))
      .setDisplaySize(w, h);
    sprite.sweat.setDisplaySize(w, h);
  }

  private setGlyphSpriteColors(sprite: GlyphSprite, bodyColor: number, hairColor: number): void {
    sprite.body.setTint(bodyColor);
    sprite.bangs.setTint(hairColor);
    sprite.legacyHair.setTint(hairColor);
    sprite.sweat.setTint(COLORS.dust);
    for (const hairNode of sprite.hairNodes) {
      hairNode.setTint(hairColor);
    }
  }

  private setGlyphSpriteFacing(sprite: GlyphSprite, facing: PlayerSnapshot["facing"]): void {
    const flipped = facing < 0;
    sprite.body.setFlipX(flipped);
    sprite.bangs.setFlipX(flipped);
    sprite.legacyHair.setFlipX(flipped);
    sprite.sweat.setFlipX(flipped);
  }

  private setGlyphSweatState(sprite: GlyphSprite, sweatState: PlayerSweatState): void {
    const visible = sweatState !== "idle";
    const frame = this.resolveSweatFrame(sweatState);
    sprite.sweat
      .setTexture(this.sweatTextureKey(sweatState, frame))
      .setVisible(visible);
  }

  private resolveSweatFrame(sweatState: PlayerSweatState): number {
    const glyph = SWEAT_GLYPHS[sweatState];
    if (!glyph.loop || glyph.frames.length <= 1) {
      return 0;
    }

    return Math.floor(this.scene.time.now / SWEAT_ANIMATION_INTERVAL_MS) % glyph.frames.length;
  }

  private updateGlyphHairState(
    sprite: GlyphSprite,
    snapshot: PlayerSnapshot,
    dt: number,
    mode: "simulate" | "snap",
  ): void {
    const layout = resolveHairLayout(snapshot);
    sprite.hairPoints = mode === "snap"
      ? snapHairChain(layout, sprite.hairNodes.length)
      : stepHairChain(sprite.hairPoints, layout, dt, sprite.hairNodes.length);
  }

  private copyGlyphHairState(from: GlyphSprite, to: GlyphSprite): void {
    to.hairPoints = from.hairPoints.map((point) => ({ x: point.x, y: point.y }));
  }

  private setGlyphHairPositions(sprite: GlyphSprite): void {
    sprite.legacyHair.setVisible(!this.dynamicHairEnabled);
    sprite.bangs.setVisible(this.dynamicHairEnabled);

    for (let i = 0; i < sprite.hairNodes.length; i++) {
      const point = sprite.hairPoints[i];
      const node = sprite.hairNodes[i];
      if (!this.dynamicHairEnabled || !point) {
        node.setVisible(false);
        continue;
      }

      node
        .setVisible(true)
        .setPosition(point.x, point.y);
    }
  }

  private glyphTextureKey(pose: Sqrt11Pose, layer: "body" | "bang"): string {
    return `sqrt11-${pose}-${layer}`;
  }

  private legacyGlyphTextureKey(pose: Sqrt11Pose, layer: "body" | "hair"): string {
    return `sqrt11-legacy-${pose}-${layer}`;
  }

  private hairNodeTextureKey(size: keyof typeof HAIR_NODE_GLYPHS): string {
    return `sqrt11-hair-node-${size}`;
  }

  private sweatTextureKey(state: PlayerSweatState, frame: number): string {
    return `sqrt11-sweat-${state}-${frame}`;
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
