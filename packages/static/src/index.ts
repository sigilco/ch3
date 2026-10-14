// @chttp/static: static asset serving authored in the scriptc-compilable
// subset. Depends on @chttp/router only. Ports are base classes
// (AssetSource), strategies are subclasses (DiskAssets, EmbeddedAssets).
export { AssetSource, isHashedName } from "./asset.ts";
export type { Asset, AssetVariant } from "./asset.ts";
export { DiskAssets } from "./disk.ts";
export { EmbeddedAssets } from "./embedded.ts";
export type { EmbedEnc, EmbedRecord } from "./embedded.ts";
export { httpDate } from "./date.ts";
export { extOf, mimeFor } from "./mime.ts";
export { StaticServer, etagMatches, serveStatic } from "./serve.ts";
export type { StaticOpts } from "./serve.ts";
