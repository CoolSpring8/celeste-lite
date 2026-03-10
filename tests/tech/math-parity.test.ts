import { describe, expect, test } from "bun:test";
import {
  approach,
  dashDirection,
  mulFloat,
  roundToEvenInt,
  sign,
  toFloat,
} from "../../src/player/math.ts";

describe("Math parity helpers", () => {
  test("midpoint rounding matches C# Math.Round midpoint-to-even semantics", () => {
    expect(roundToEvenInt(0.5)).toBe(0);
    expect(roundToEvenInt(1.5)).toBe(2);
    expect(roundToEvenInt(2.5)).toBe(2);
    expect(roundToEvenInt(-0.5)).toBe(0);
    expect(roundToEvenInt(-1.5)).toBe(-2);
    expect(roundToEvenInt(-2.5)).toBe(-2);
  });

  test("sign collapses negative zero to 0 like C# Math.Sign", () => {
    expect(sign(-0)).toBe(0);
    expect(Object.is(sign(-0), -0)).toBeFalse();
    expect(sign(-12)).toBe(-1);
    expect(sign(18)).toBe(1);
  });

  test("float32 helpers keep Celeste-style dt math in single precision", () => {
    const dt = toFloat(1 / 60);
    const accelStep = mulFloat(900, dt);
    const climbed = approach(0, 80, accelStep);

    expect(dt).toBe(0.01666666753590107);
    expect(accelStep).toBe(15.000000953674316);
    expect(climbed).toBe(15.000000953674316);
  });

  test("dash direction snaps to Monocle eight-way float32 vectors", () => {
    const diagonal = dashDirection(1, 1, 1);
    expect(diagonal.x).toBe(Math.fround(Math.cos(Math.PI / 4)));
    expect(diagonal.y).toBe(Math.fround(Math.sin(Math.PI / 4)));

    expect(dashDirection(0, 0, -1)).toEqual({ x: -1, y: 0 });
    expect(dashDirection(-1, 1, 1)).toEqual({
      x: Math.fround(Math.cos((3 * Math.PI) / 4)),
      y: Math.fround(Math.sin((3 * Math.PI) / 4)),
    });
  });
});
