import { appendFileSync } from "node:fs";

// Subset-native audit line writer. Mirrors the shape of LogTape's default text
// formatter ("<timestamp> [INF] audit: <message>"); only the timestamp style differs.
export function auditLine(level: string, message: string): string {
  return new Date().toISOString() + " [" + level + "] audit: " + message + "\n";
}

export function fileAudit(path: string, level: string, message: string): void {
  appendFileSync(path, auditLine(level, message));
}
