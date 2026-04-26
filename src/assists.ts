export type AirDashAssist = "default" | "two" | "infinite";

export interface AssistOptions {
  infiniteStamina: boolean;
  airDashes: AirDashAssist;
  invincibility: boolean;
}

export const DEFAULT_ASSIST_OPTIONS: Readonly<AssistOptions> = Object.freeze({
  infiniteStamina: false,
  airDashes: "default",
  invincibility: false,
});
