// Parser registry. "classic" (the tsc 5.x/6.x API) is the default; new
// adapters register by name. extract.ts resolves exactly one parser at
// extraction start and never sees which one.

import { ClassicParser } from "./classic.ts";
import type { Parser } from "./types.ts";

export type { AstSource, Kinds, Parser } from "./types.ts";
export type * from "./types.ts";

const REGISTRY: { [name: string]: () => Parser } = {
  classic: function (): Parser {
    return new ClassicParser();
  },
};

const CACHE: { [name: string]: Parser } = {};

export function getParser(name?: string): Parser {
  const key = name === undefined || name === "" ? "classic" : name;
  if (Object.prototype.hasOwnProperty.call(REGISTRY, key) === false) {
    throw new Error("unplugin-ch3: unknown parser '" + key + "' (available: classic)");
  }
  if (Object.prototype.hasOwnProperty.call(CACHE, key) === false) {
    CACHE[key] = REGISTRY[key]();
  }
  return CACHE[key];
}
