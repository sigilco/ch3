// Compile traps for h3.
import { createRouter, eventHandler, getRouterParam, readBody } from 'h3'

const router = createRouter()

router.get('/user/:id', eventHandler((e) => {
  const n = getRouterParam(e, 'nam') // @dx-expect-error[param-name]
  return { n: n }
}))

router.get('/user/:id/again', eventHandler((e) => {
  const o = getRouterParam(e, 'org') // @dx-expect-error[param-on-unmatched-route]
  return { o: o }
}))

router.get('no-slash', eventHandler(() => { // @dx-expect-error[bad-path]
  return 'x'
}))

router.get('/m', eventHandler(async (e) => {
  const b = readBody(e)
  return { name: b.name } // @dx-expect-error[missing-await]
}))

router.get('/q', eventHandler((e) => {
  const v = getRouterParam(e, 'limit') // @dx-expect-error[query-not-param]
  return { v: v }
}))

router.get('/arity', eventHandler((a, b, d, e) => { // @dx-expect-error[handler-arity]
  return d.text('x')
}))
