// Client entry. Imports the typed client emitted by @chttp/unplugin
// from src/.chttp/routes.client.ts. The verb methods are typed
// against the route table; a typo or unknown verb is a compile error.
import { createClient } from "./.chttp/routes.client.ts";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
export const api = createClient({ baseUrl });
