---
"@chttp/router": minor
"@chttp/unplugin": minor
---

Multipart uploads: per-route multipart option parses the stream at dispatch (memoryStorage/diskStorage, streaming maxFileBytes/maxFiles/maxFieldBytes -> 413), c.req.file/field/files/fields; unplugin declines declared-multipart routes (contract v3).
