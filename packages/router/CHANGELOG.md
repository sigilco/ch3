# @chttp/router

## 0.2.0

### Minor Changes

- router: serve() no longer attaches the upgrade listener; wire server.on(upgrade, ...) in your own program (npm-static compilation stays 100% for every app)

- Add c.bytes(buf, contentType) for binary response bodies
