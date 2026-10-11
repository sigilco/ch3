import type { IncomingMessage, ServerResponse } from 'node:http'

// Every subject task module default-exports `build(): Listener` — a plain
// node:http request listener the judge mounts on an ephemeral port.
export type Listener = (req: IncomingMessage, res: ServerResponse) => void
