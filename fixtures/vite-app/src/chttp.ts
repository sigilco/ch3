// chttp entry for this fixture: the repo source itself, not the built
// package. scriptc can only lower program code — a module that imports a
// binding rooted at package instantiation loses lowering (SC1090), and
// node:http objects cannot cross the --dynamic boundary — so the whole
// app graph must reach the router through source paths.
export * from '../../../packages/router/src/index.ts'
