import { describe, expect, test } from "bun:test";
import {
  UnpauseRecovery,
  UNPAUSE_CONTROL_RETURN_FRAME,
  UNPAUSE_INPUT_BUFFER_START_FRAME,
  UNPAUSE_REPAUSE_FRAME,
} from "../../src/pause/unpauseRecovery.ts";

describe("Checklist pause buffering", () => {
  test("late-held pause and inputs follow the frame 0-11 pause-buffer table", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_REPAUSE_FRAME; frame++) {
      const held = frame >= UNPAUSE_INPUT_BUFFER_START_FRAME;
      const result = recovery.step({
        pause: held,
        jump: held,
        dash: held,
        crouchDash: false,
      });

      if (frame < UNPAUSE_INPUT_BUFFER_START_FRAME) {
        expect(result.blockGameplay).toBeTrue();
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
        expect(result.openPause).toBeFalse();
      } else if (frame < UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeTrue();
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
        expect(result.openPause).toBeFalse();
      } else if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeFalse();
        expect(result.queueJump).toBeTrue();
        expect(result.queueDash).toBeTrue();
        expect(result.openPause).toBeFalse();
      } else {
        expect(result.blockGameplay).toBeTrue();
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
        expect(result.openPause).toBeTrue();
      }
    }
  });

  test("pause held before frame 6 is not treated as a frame-11 repause buffer", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_REPAUSE_FRAME; frame++) {
      const result = recovery.step({
        pause: frame >= UNPAUSE_INPUT_BUFFER_START_FRAME - 1,
        jump: false,
        dash: false,
        crouchDash: false,
      });

      if (frame === UNPAUSE_REPAUSE_FRAME) {
        expect(result.blockGameplay).toBeFalse();
        expect(result.openPause).toBeFalse();
      }
    }
  });
});
