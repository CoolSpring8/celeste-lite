import { describe, expect, test } from "bun:test";
import {
  UnpauseRecovery,
  UNPAUSE_CONTROL_RETURN_FRAME,
  UNPAUSE_INPUT_BUFFER_START_FRAME,
  UNPAUSE_REPAUSE_FRAME,
} from "../../src/pause/unpauseRecovery.ts";

describe("Unpause recovery", () => {
  test("blocks gameplay for 10 frames, returns control on frame 10, and allows repause on frame 11", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: true, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_REPAUSE_FRAME; frame++) {
      const holdingPause = frame >= UNPAUSE_INPUT_BUFFER_START_FRAME;
      const result = recovery.step({
        pause: holdingPause,
        jump: false,
        dash: false,
        crouchDash: false,
      });

      if (frame < UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeTrue();
        expect(result.openPause).toBeFalse();
      } else if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeFalse();
        expect(result.openPause).toBeFalse();
      } else {
        expect(result.blockGameplay).toBeTrue();
        expect(result.openPause).toBeTrue();
      }
    }
  });

  test("pause held too early does not repause on frame 11", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_REPAUSE_FRAME; frame++) {
      const result = recovery.step({
        pause: frame >= UNPAUSE_INPUT_BUFFER_START_FRAME - 1,
        jump: false,
        dash: false,
        crouchDash: false,
      });

      if (frame < UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.openPause).toBeFalse();
      } else if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeFalse();
      } else {
        expect(result.blockGameplay).toBeFalse();
        expect(result.openPause).toBeFalse();
      }
    }
  });

  test("jump and dash held during the late unpause window queue on the control-return frame", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_CONTROL_RETURN_FRAME; frame++) {
      const result = recovery.step({
        pause: false,
        jump: frame >= UNPAUSE_INPUT_BUFFER_START_FRAME,
        dash: frame >= UNPAUSE_INPUT_BUFFER_START_FRAME,
        crouchDash: false,
      });

      if (frame < UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
      } else {
        expect(result.blockGameplay).toBeFalse();
        expect(result.queueJump).toBeTrue();
        expect(result.queueDash).toBeTrue();
      }
    }
  });

  test("crouch dash held during the late unpause window queues on the control-return frame", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_CONTROL_RETURN_FRAME; frame++) {
      const result = recovery.step({
        pause: false,
        jump: false,
        dash: false,
        crouchDash: frame >= UNPAUSE_INPUT_BUFFER_START_FRAME,
      });

      if (frame < UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.queueCrouchDash).toBeFalse();
      } else {
        expect(result.blockGameplay).toBeFalse();
        expect(result.queueCrouchDash).toBeTrue();
      }
    }
  });

  test("buffered jump and dash are lost if the buttons are released before control returns", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_CONTROL_RETURN_FRAME; frame++) {
      const held = frame >= UNPAUSE_INPUT_BUFFER_START_FRAME && frame < UNPAUSE_CONTROL_RETURN_FRAME - 1;
      const result = recovery.step({
        pause: false,
        jump: held,
        dash: held,
        crouchDash: false,
      });

      if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
      }
    }
  });

  test("jump and dash that begin exactly on the control-return frame are left to the normal input path", () => {
    const recovery = new UnpauseRecovery();
    recovery.start({ pause: false, jump: false, dash: false, crouchDash: false });

    for (let frame = 0; frame <= UNPAUSE_CONTROL_RETURN_FRAME; frame++) {
      const result = recovery.step({
        pause: false,
        jump: frame === UNPAUSE_CONTROL_RETURN_FRAME,
        dash: frame === UNPAUSE_CONTROL_RETURN_FRAME,
        crouchDash: false,
      });

      if (frame === UNPAUSE_CONTROL_RETURN_FRAME) {
        expect(result.blockGameplay).toBeFalse();
        expect(result.queueJump).toBeFalse();
        expect(result.queueDash).toBeFalse();
      }
    }
  });
});
