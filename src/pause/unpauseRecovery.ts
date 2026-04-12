export interface UnpauseRecoveryHeldState {
  pause: boolean;
  jump: boolean;
  dash: boolean;
}

export interface UnpauseRecoveryStepResult {
  blockGameplay: boolean;
  openPause: boolean;
  queueJump: boolean;
  queueDash: boolean;
}

export const UNPAUSE_INPUT_BUFFER_START_FRAME = 6;
export const UNPAUSE_CONTROL_RETURN_FRAME = 10;
export const UNPAUSE_REPAUSE_FRAME = 11;

const EMPTY_STEP_RESULT: UnpauseRecoveryStepResult = {
  blockGameplay: false,
  openPause: false,
  queueJump: false,
  queueDash: false,
};

export class UnpauseRecovery {
  private frame = -1;
  private prevPauseDown = false;
  private prevJumpDown = false;
  private prevDashDown = false;
  private pauseBuffered = false;
  private jumpBuffered = false;
  private dashBuffered = false;

  get active(): boolean {
    return this.frame >= 0;
  }

  get blocksControl(): boolean {
    return this.active && this.frame < UNPAUSE_CONTROL_RETURN_FRAME;
  }

  start(held: UnpauseRecoveryHeldState): void {
    this.frame = 0;
    this.prevPauseDown = held.pause;
    this.prevJumpDown = held.jump;
    this.prevDashDown = held.dash;
    this.pauseBuffered = false;
    this.jumpBuffered = false;
    this.dashBuffered = false;
  }

  clear(): void {
    this.frame = -1;
    this.prevPauseDown = false;
    this.prevJumpDown = false;
    this.prevDashDown = false;
    this.pauseBuffered = false;
    this.jumpBuffered = false;
    this.dashBuffered = false;
  }

  step(held: UnpauseRecoveryHeldState): UnpauseRecoveryStepResult {
    if (!this.active) {
      return EMPTY_STEP_RESULT;
    }

    const frame = this.frame;
    const pausePressed = held.pause && !this.prevPauseDown;
    const jumpPressed = held.jump && !this.prevJumpDown;
    const dashPressed = held.dash && !this.prevDashDown;

    if (frame >= UNPAUSE_INPUT_BUFFER_START_FRAME && frame < UNPAUSE_CONTROL_RETURN_FRAME) {
      if (jumpPressed) {
        this.jumpBuffered = true;
      }
      if (dashPressed) {
        this.dashBuffered = true;
      }
    }

    if (frame >= UNPAUSE_INPUT_BUFFER_START_FRAME && frame <= UNPAUSE_REPAUSE_FRAME && pausePressed) {
      this.pauseBuffered = true;
    }

    if (!held.pause) {
      this.pauseBuffered = false;
    }
    if (!held.jump) {
      this.jumpBuffered = false;
    }
    if (!held.dash) {
      this.dashBuffered = false;
    }

    let result: UnpauseRecoveryStepResult;

    if (frame >= UNPAUSE_REPAUSE_FRAME) {
      result = {
        blockGameplay: this.pauseBuffered && held.pause,
        openPause: this.pauseBuffered && held.pause,
        queueJump: false,
        queueDash: false,
      };
      this.clear();
      return result;
    }

    if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
      result = {
        blockGameplay: false,
        openPause: false,
        queueJump: this.jumpBuffered && held.jump,
        queueDash: this.dashBuffered && held.dash,
      };
      this.frame++;
      this.prevPauseDown = held.pause;
      this.prevJumpDown = held.jump;
      this.prevDashDown = held.dash;
      return result;
    }

    this.frame++;
    this.prevPauseDown = held.pause;
    this.prevJumpDown = held.jump;
    this.prevDashDown = held.dash;
    return {
      blockGameplay: true,
      openPause: false,
      queueJump: false,
      queueDash: false,
    };
  }
}
