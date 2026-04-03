import { describe, expect, test } from "bun:test";
import { StateMachine } from "../../src/player/StateMachine.ts";

const DT = 1 / 60;

describe("StateMachine", () => {
  test("locked blocks cross-state transitions, but forceState can restart the current state", () => {
    const log: string[] = [];
    const machine = new StateMachine<"boot" | "idle" | "dash">("boot");

    machine.setCallbacks(
      "idle",
      undefined,
      undefined,
      () => log.push("idle begin"),
      () => log.push("idle end"),
    );
    machine.setCallbacks(
      "dash",
      undefined,
      undefined,
      () => log.push("dash begin"),
      () => log.push("dash end"),
    );

    machine.state = "idle";
    expect(machine.state).toBe("idle");
    expect(log).toEqual(["idle begin"]);

    log.length = 0;
    machine.locked = true;

    machine.state = "dash";
    expect(machine.state).toBe("idle");
    expect(log).toEqual([]);

    machine.forceState("dash");
    expect(machine.state).toBe("idle");
    expect(log).toEqual([]);

    machine.forceState("idle");
    expect(machine.state).toBe("idle");
    expect(machine.previousState).toBe("idle");
    expect(log).toEqual(["idle end", "idle begin"]);
  });

  test("forceState on the same state reruns end and begin and restarts the coroutine", () => {
    const log: string[] = [];
    let runs = 0;
    const machine = new StateMachine<"boot" | "dash">("boot");

    machine.setCallbacks(
      "dash",
      undefined,
      function* () {
        const run = ++runs;
        log.push(`coroutine start ${run}`);
        yield null;
        log.push(`coroutine resume ${run}`);
      },
      () => log.push("dash begin"),
      () => log.push("dash end"),
    );

    machine.state = "dash";
    expect(log).toEqual(["dash begin"]);

    log.length = 0;
    machine.update(DT);
    expect(log).toEqual(["coroutine start 1"]);

    machine.forceState("dash");
    expect(log).toEqual(["coroutine start 1", "dash end", "dash begin"]);

    machine.update(DT);
    machine.update(DT);

    expect(log).toEqual([
      "coroutine start 1",
      "dash end",
      "dash begin",
      "coroutine start 2",
      "coroutine resume 2",
    ]);
    expect(log.includes("coroutine resume 1")).toBeFalse();
  });

  test("same-state forceState can restart the current state even while locked", () => {
    const log: string[] = [];
    const machine = new StateMachine<"boot" | "idle">("boot");

    machine.setCallbacks(
      "idle",
      undefined,
      undefined,
      () => log.push("idle begin"),
      () => log.push("idle end"),
    );

    machine.state = "idle";
    log.length = 0;
    machine.locked = true;

    machine.forceState("idle");

    expect(machine.state).toBe("idle");
    expect(log).toEqual(["idle end", "idle begin"]);
  });

  test("nested coroutine timing advances one layer per update and honors numeric waits", () => {
    const log: string[] = [];
    const machine = new StateMachine<"boot" | "combo">("boot");

    function* inner(): Generator<number | null, void, unknown> {
      log.push("inner start");
      yield null;
      log.push("inner end");
    }

    function* outer(): Generator<number | null | Generator<number | null, void, unknown>, void, unknown> {
      log.push("outer start");
      yield inner();
      log.push("outer after inner");
      yield 0.05;
      log.push("outer done");
    }

    machine.setCallbacks("combo", undefined, outer);
    machine.state = "combo";

    machine.update(DT);
    expect(log).toEqual(["outer start"]);

    machine.update(DT);
    expect(log).toEqual(["outer start", "inner start"]);

    machine.update(DT);
    expect(log).toEqual(["outer start", "inner start", "inner end"]);

    machine.update(DT);
    expect(log).toEqual(["outer start", "inner start", "inner end", "outer after inner"]);

    machine.update(0.03);
    expect(log).toEqual(["outer start", "inner start", "inner end", "outer after inner"]);

    machine.update(0.03);
    expect(log).toEqual(["outer start", "inner start", "inner end", "outer after inner"]);

    machine.update(DT);
    expect(log).toEqual(["outer start", "inner start", "inner end", "outer after inner", "outer done"]);
  });
});
