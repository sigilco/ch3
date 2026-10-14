import { esc } from "../lib/html.ts";

export function home(title: string, name: string): string {
  return "<h1>" + esc(title) + "</h1><p>Hello " + esc(name) + "</p>";
}
