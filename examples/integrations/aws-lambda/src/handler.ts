// APIGW proxy integration bridge. Converts the v2.0 event JSON
// into a Web Request, hands it to `app.fetch`, and serializes
// the resulting Response back into the APIGW proxy result format.
//
// Two surfaces share this file:
//   1. `provided.al2023` runtime: the source compiles to a
//      static ELF via `scriptc build` (see `pnpm build:elf`)
//      and replaces `bootstrap` in the deployment zip. Lambda
//      invokes the binary with the event JSON on stdin and
//      reads the proxy result from stdout.
//   2. `nodejs20.x` (or later) runtime: invoked through
//      `@aws-sdk` or a plain handler export. The bridge is
//      identical — only the surrounding runtime changes.
//
// The scriptc 0.3.1 subset does not lower the EventStream
// shape that `lambda.RuntimeClient` uses, so the `nodejs` path
// here is a plain `(event, context) => result` synchronous
// function. The `provided.al2023` ELF handles its own
// stdin/stdout protocol and is invoked through Lambda's
// custom runtime API — see the README for the exact wiring.

import { createApp } from "./app.ts";

const app = createApp();

// Lambda URL / API Gateway HTTP API v2 payload format (v2.0):
//   { version: '2.0', routeKey, rawPath, rawQueryString,
//     headers, queryStringParameters, requestContext: {...},
//     body, isBase64Encoded }
type APIGWv2Event = {
  version: string;
  rawPath: string;
  rawQueryString: string;
  headers: Record<string, string> | null;
  queryStringParameters: Record<string, string> | null;
  body: string | null;
  isBase64Encoded: boolean;
  requestContext: {
    http: { method: string };
  };
};

// APIGW proxy v2.0 result format. The `headers` field is
// constrained to single-value pairs — multi-value headers
// (e.g. set-cookie) need the v1.0 payload or the ALB
// multi-value headers variant. Lambda URL responses with
// multiple Set-Cookie require cookies to be joined into a
// single comma-separated value (against spec, but the
// v2.0 format's only path). For real Set-Cookie support
// on a Lambda URL or HTTP API, use the v1.0 payload.
type APIGWv2Result = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
};

function decodeBody(b: string, isBase64: boolean): Uint8Array | string {
  if (b === null || b === "") {
    return "";
  }
  if (isBase64) {
    return Buffer.from(b, "base64");
  }
  return b;
}

async function eventToRequest(e: APIGWv2Event): Promise<Request> {
  const url = "https://localhost" + e.rawPath + (e.rawQueryString ? "?" + e.rawQueryString : "");
  const headers = new Headers();
  if (e.headers !== null) {
    for (const k in e.headers) {
      if (Object.prototype.hasOwnProperty.call(e.headers, k)) {
        headers.set(k, e.headers[k]);
      }
    }
  }
  const init: RequestInit = {
    method: e.requestContext.http.method,
    headers: headers,
  };
  // GET/HEAD cannot carry a body — omit it from the init so
  // the Request constructor doesn't reject the event. The
  // underlying APIGW event for those methods always has
  // body === null; the guard makes the bridge robust against
  // non-spec callers.
  const method = e.requestContext.http.method;
  if (method !== "GET" && method !== "HEAD" && e.body !== null && e.body !== "") {
    const body = decodeBody(e.body, e.isBase64Encoded);
    if (typeof body === "string") {
      init.body = body;
    } else {
      // scriptc 0.3.1's type world has no BodyInit; the
      // `unknown` indirection + Buffer | Uint8Array | string
      // covers every legal request body shape.
      init.body = body as unknown as string;
    }
  }
  return new Request(url, init);
}

async function responseToResult(res: Response): Promise<APIGWv2Result> {
  const buf = await res.arrayBuffer();
  const text = new TextDecoder().decode(buf);
  const headers: Record<string, string> = {};
  // scriptc 0.3.1's Headers type doesn't expose forEach
  // directly (method calls on Headers values fence as
  // SC1090). The chttp router's headersFromRaw helper uses
  // the same cast pattern; copy it here.
  const h = (res as unknown as { headers: { forEach: (cb: (v: string, k: string) => void) => void } }).headers;
  h.forEach(function (v: string, k: string): void {
    headers[k] = v;
  });
  return {
    statusCode: res.status,
    headers: headers,
    body: text,
    isBase64Encoded: false,
  };
}

export async function handler(event: APIGWv2Event): Promise<APIGWv2Result> {
  const req = await eventToRequest(event);
  const res = await app.fetch(req);
  return responseToResult(res);
}

// provided.al2023 entry: read the event JSON from stdin,
// call the handler, write the result JSON to stdout.
// The custom runtime contract is documented at
// https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html
async function bootstrap(): Promise<void> {
  const chunks: Buffer[] = [];
  await new Promise<void>(function (resolve, reject): void {
    process.stdin.on("data", function (c: Buffer): void {
      chunks.push(c);
    });
    process.stdin.on("end", function (): void {
      resolve();
    });
    process.stdin.on("error", function (e: Error): void {
      reject(e);
    });
  });
  const raw = Buffer.concat(chunks).toString("utf8");
  const event = JSON.parse(raw) as APIGWv2Event;
  const result = await handler(event);
  process.stdout.write(JSON.stringify(result));
}

const isCustomRuntime = process.env.AWS_LAMBDA_RUNTIME_API !== undefined;
if (isCustomRuntime) {
  void bootstrap();
}
