---
"@chttp/router": minor
---

router: serve() no longer attaches the upgrade listener; wire server.on(upgrade, ...) in your own program (npm-static compilation stays 100% for every app)
