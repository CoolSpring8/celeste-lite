import Phaser from "phaser";
import { COLORS, PLAYER_GEOMETRY } from "../constants";
import { PlayerEffect, PlayerSnapshot } from "../player/types";

interface Afterimage {
  rect: Phaser.GameObjects.Rectangle;
  life: number;
  maxLife: number;
}

export class PlayerView {
  private scene: Phaser.Scene;
  private body: Phaser.GameObjects.Rectangle;
  private afterimages: Afterimage[] = [];
  private afterimagePool: Phaser.GameObjects.Rectangle[] = [];
  private trailTimer = 0;
  private wallDustTimer = 0;

  private dashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private wallEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensurePixelTexture();

    this.body = this.scene.add
      .rectangle(0, 0, PLAYER_GEOMETRY.drawW, PLAYER_GEOMETRY.drawH, COLORS.player)
      .setOrigin(0.5, 1)
      .setDepth(5);

    this.dashEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: 30, max: 100 },
      lifespan: { min: 80, max: 160 },
      quantity: 0,
      scale: { start: 1.1, end: 0.2 },
      alpha: { start: 0.8, end: 0 },
      tint: COLORS.playerDash,
      gravityY: 0,
      emitting: false,
      blendMode: "ADD",
    });
    this.dashEmitter.setDepth(3);

    this.wallEmitter = this.scene.add.particles(0, 0, "pixel", {
      speed: { min: 10, max: 40 },
      lifespan: { min: 100, max: 220 },
      quantity: 0,
      scale: { start: 1, end: 0.1 },
      alpha: { start: 0.7, end: 0 },
      tint: COLORS.tileEdge,
      gravityY: 100,
      emitting: false,
    });
    this.wallEmitter.setDepth(2);
  }

  render(snapshot: PlayerSnapshot, effects: PlayerEffect[], dt: number): void {
    this.processEffects(snapshot, effects);
    this.updateAfterimages(dt);
    this.updateTrail(snapshot, dt);

    const drawX = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const drawY = snapshot.y + snapshot.hitboxH;

    this.body.setSize(snapshot.drawW, snapshot.drawH);
    this.body.setPosition(drawX, drawY);
    this.body.setFillStyle(this.resolveColor(snapshot), 1);
  }

  destroy(): void {
    this.body.destroy();
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
        case "super":
          this.squash(0.7, 1.32, 95);
          this.emitDashBurst(snapshot, 10);
          break;
        case "jump":
          this.squash(0.72, 1.28, 90);
          break;
        case "wall_jump":
          this.squash(0.65, 1.35, 100);
          this.emitWallBurst(snapshot);
          break;
        case "dash_start":
          this.squash(1.35, 0.7, 80);
          this.emitDashBurst(snapshot, 8);
          this.scene.cameras.main.shake(50, 0.002);
          break;
        case "wall_bounce":
          this.squash(0.55, 1.5, 100);
          this.emitWallBurst(snapshot);
          this.scene.cameras.main.shake(70, 0.003);
          break;
        case "land":
          this.squash(1.28, 0.74, 120);
          break;
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
    if (
      !snapshot.onGround &&
      snapshot.wallDir !== 0 &&
      snapshot.vy > 0 &&
      snapshot.state === "normal"
    ) {
      this.wallDustTimer -= dt;
      if (this.wallDustTimer <= 0) {
        this.wallDustTimer = 0.04;
        const px = snapshot.wallDir < 0 ? snapshot.x - 1 : snapshot.x + PLAYER_GEOMETRY.hitboxW + 1;
        const py = snapshot.y + Math.random() * snapshot.hitboxH;
        this.wallEmitter.emitParticleAt(px, py, 1);
      }
    }

    if (snapshot.state !== "dash") return;

    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;

    this.trailTimer = 0.02;
    this.spawnAfterimage(snapshot, this.resolveColor(snapshot));

    const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const cy = snapshot.y + snapshot.hitboxH / 2;
    this.dashEmitter.emitParticleAt(cx, cy, 1);
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
      .rectangle(0, 0, drawW, drawH, COLORS.playerDash)
      .setOrigin(0.5, 1)
      .setDepth(4)
      .setVisible(false);
  }

  private squash(scaleX: number, scaleY: number, duration: number): void {
    this.body.setScale(scaleX, scaleY);
    this.scene.tweens.add({
      targets: this.body,
      scaleX: 1,
      scaleY: 1,
      duration,
      ease: "Quad.Out",
    });
  }

  private emitDashBurst(snapshot: PlayerSnapshot, count: number): void {
    const cx = snapshot.x + PLAYER_GEOMETRY.hitboxW / 2;
    const cy = snapshot.y + snapshot.hitboxH / 2;
    this.dashEmitter.emitParticleAt(cx, cy, count);
  }

  private emitWallBurst(snapshot: PlayerSnapshot): void {
    const px = snapshot.wallDir < 0 ? snapshot.x - 1 : snapshot.x + PLAYER_GEOMETRY.hitboxW + 1;
    const py = snapshot.y + snapshot.hitboxH * 0.5;
    this.wallEmitter.emitParticleAt(px, py, 8);
  }

  private resolveColor(snapshot: PlayerSnapshot): number {
    if (
      snapshot.state === "dash" ||
      snapshot.state === "dashAttack" ||
      snapshot.state === "freeze"
    ) {
      return COLORS.playerDash;
    }

    if (snapshot.dashesLeft <= 0) {
      return COLORS.playerNoDash;
    }

    return COLORS.player;
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
