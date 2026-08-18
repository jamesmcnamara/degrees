import type { Id } from "./types";

/** Generate a unique id. Uses the platform's crypto where available. */
export const newId = (): Id =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
