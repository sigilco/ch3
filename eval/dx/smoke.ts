import { createRouter } from '@sigilco/ch3'

const app = createRouter()
app.get('/json', (c) => c.json({ ok: true }))
const listener = app.handler()
console.log(typeof listener)
