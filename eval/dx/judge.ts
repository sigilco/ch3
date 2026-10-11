// eval/dx/judge.ts — DX evaluation harness.
//
// Script-verified parts (this file):
//   - tsc --noEmit compile check per subject/task file
//   - expect-error probes: does a diagnostic land on each marked line?
//   - runtime assertions against a live node:http server per task
//   - LOC + import counting per task file
//   - API-surface inspection (member exists, overload count) via the
//     TypeScript checker
//   - "single-way" flags: verified candidate APIs per task aspect
//
// LLM-judged parts (NOT this file): error-message quality, "one obvious
// way" judgement, implementation variance. See JUDGE-PROMPT.md and
// judge-output/.
//
// Usage: npx tsx judge.ts [--json]

import ts from 'typescript'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Listener } from './lib/types'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SUBJECTS = ['ch3', 'hono', 'express', 'h3'] as const
type Subject = (typeof SUBJECTS)[number]
const TASKS = ['01-crud', '02-mounting', '03-versioned-405', '04-errors', '05-query', '06-precedence', '07-traps'] as const
type Task = (typeof TASKS)[number]

// ---------------------------------------------------------------------------
// tsconfig options shared by every program the judge creates
// ---------------------------------------------------------------------------

const configPath = path.join(DIR, 'tsconfig.json')
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, DIR)
const COMPILER_OPTIONS = parsed.options

// ---------------------------------------------------------------------------
// Runtime check table — shared expectations across subjects.
// `expect` returns null when the assertion is record-only.
// ---------------------------------------------------------------------------

interface CheckResult {
  desc: string
  pass: boolean | null // null = recorded only
  observed: { status: number | string; body: string; headers: Record<string, string | null> }
  detail?: string
}

interface Check {
  desc: string
  method: string
  path: string
  body?: string
  headers?: Record<string, string>
  expect?: (r: { status: number; body: string; headers: Record<string, string | null> }) => string | null // null=pass, else reason
}

function jsonHas(body: string, want: Record<string, unknown>): string | null {
  let b: any
  try {
    b = JSON.parse(body)
  } catch {
    return `body not JSON: ${body.slice(0, 80)}`
  }
  for (const k of Object.keys(want)) {
    const got = b[k]
    const w = want[k]
    if (JSON.stringify(got) !== JSON.stringify(w)) {
      return `${k}: want ${JSON.stringify(w)}, got ${JSON.stringify(got)}`
    }
  }
  return null
}

const TASK_CHECKS: Record<Task, Check[]> = {
  '01-crud': [
    { desc: 'GET /users', method: 'GET', path: '/users', expect: (r) => (r.status === 200 ? null : `status ${r.status}`) },
    { desc: 'GET /users/42', method: 'GET', path: '/users/42', expect: (r) => (r.status === 200 ? jsonHas(r.body, { id: '42' }) : `status ${r.status}`) },
    { desc: 'POST /users valid', method: 'POST', path: '/users', body: '{"name":"ada"}', headers: { 'content-type': 'application/json' }, expect: (r) => (r.status === 201 ? jsonHas(r.body, { name: 'ada' }) : `status ${r.status}`) },
    { desc: 'POST /users invalid', method: 'POST', path: '/users', body: '{}', headers: { 'content-type': 'application/json' }, expect: (r) => (r.status === 400 ? null : `status ${r.status} (want 400)`) },
    { desc: 'PUT /users/7', method: 'PUT', path: '/users/7', body: '{"name":"b"}', headers: { 'content-type': 'application/json' }, expect: (r) => (r.status === 200 ? jsonHas(r.body, { id: '7', name: 'b' }) : `status ${r.status}`) },
    { desc: 'DELETE /users/9', method: 'DELETE', path: '/users/9', expect: (r) => (r.status === 204 ? null : `status ${r.status} (want 204)`) },
  ],
  '02-mounting': [
    { desc: 'GET /health unguarded', method: 'GET', path: '/health', expect: (r) => (r.status === 200 ? (r.headers['x-guard'] === null ? null : 'x-guard leaked to /health') : `status ${r.status}`) },
    { desc: 'GET /api/data no token', method: 'GET', path: '/api/data', expect: (r) => (r.status === 401 ? null : `status ${r.status} (want 401)`) },
    { desc: 'GET /api/data token', method: 'GET', path: '/api/data?token=x', expect: (r) => (r.status === 200 ? (r.headers['x-guard'] === 'api' ? null : `x-guard=${r.headers['x-guard']}`) : `status ${r.status}`) },
    { desc: 'GET /api/more token', method: 'GET', path: '/api/more?token=x', expect: (r) => (r.status === 200 ? null : `status ${r.status}`) },
  ],
  '03-versioned-405': [
    { desc: 'GET /v1/items', method: 'GET', path: '/v1/items', expect: (r) => (r.status === 200 ? jsonHas(r.body, { v: 1 }) : `status ${r.status}`) },
    { desc: 'GET /v2/items', method: 'GET', path: '/v2/items', expect: (r) => (r.status === 200 ? jsonHas(r.body, { v: 2 }) : `status ${r.status}`) },
    {
      desc: 'POST /v1/items (want 405+Allow)',
      method: 'POST',
      path: '/v1/items',
      body: '{}',
      expect: (r) => {
        if (r.status !== 405) return `status ${r.status} (want 405)`
        const allow = r.headers['allow'] || ''
        return allow.includes('GET') ? null : `allow=${allow} missing GET`
      },
    },
    { desc: 'OPTIONS /v1/items (recorded)', method: 'OPTIONS', path: '/v1/items' },
  ],
  '04-errors': [
    {
      desc: 'GET /handled (want 400 json)',
      method: 'GET',
      path: '/handled',
      expect: (r) => (r.status === 400 ? jsonHas(r.body, { error: 'bad input' }) : `status ${r.status} (want 400)`),
    },
    { desc: 'GET /boom (recorded)', method: 'GET', path: '/boom' },
  ],
  '05-query': [
    {
      desc: '?tag=a&tag=b&limit=5',
      method: 'GET',
      path: '/search?tag=a&tag=b&limit=5',
      expect: (r) => (r.status === 200 ? jsonHas(r.body, { tags: ['a', 'b'], limit: 5, offset: 0 }) : `status ${r.status}`),
    },
    { desc: '?tag=a', method: 'GET', path: '/search?tag=a', expect: (r) => (r.status === 200 ? jsonHas(r.body, { tags: ['a'] }) : `status ${r.status}`) },
    { desc: '/search bare', method: 'GET', path: '/search', expect: (r) => (r.status === 200 ? jsonHas(r.body, { tags: [], limit: 20, offset: 0 }) : `status ${r.status}`) },
  ],
  '06-precedence': [
    { desc: 'GET /assets/logo.png (want static)', method: 'GET', path: '/assets/logo.png', expect: (r) => jsonHas(r.body, { kind: 'static' }) },
    { desc: 'GET /assets/x (want param)', method: 'GET', path: '/assets/x', expect: (r) => jsonHas(r.body, { kind: 'param' }) },
    { desc: 'GET /assets/a/b (want wild)', method: 'GET', path: '/assets/a/b', expect: (r) => jsonHas(r.body, { kind: 'wild' }) },
    { desc: 'GET /assets (recorded)', method: 'GET', path: '/assets' },
  ],
  '07-traps': [
    {
      desc: 'GET /async (want loud error, not hang)',
      method: 'GET',
      path: '/async',
      expect: (r) => (r.status >= 400 && r.status < 600 ? null : `status ${r.status}`),
    },
    { desc: 'GET /double (recorded)', method: 'GET', path: '/double' },
  ],
}

// ---------------------------------------------------------------------------
// "Single-way" candidates: which public APIs can express each task's headline
// pattern. `member` = type-surface check on surface/<subject>.surface.ts;
// `export` = runtime module export check; `syntax` = pattern-syntax variant
// (documented, not mechanically checkable). Judge verifies member/export
// candidates; syntax candidates count directly.
// ---------------------------------------------------------------------------

interface WayCandidate {
  desc: string
  member?: string // dotted path from a surface export, e.g. 'app.get' or 'c.req.queries'
  moduleExport?: string // exported function name in the subject's package
  syntax?: boolean
  partial?: boolean // exists but does NOT express the task's pattern (e.g. single-value query read for an array requirement)
}

const WAYS: Record<Task, Record<Subject, WayCandidate[]>> = {
  '01-crud': {
    ch3: [{ desc: 'app.get(path, h)', member: 'app.get' }, { desc: "app.on('GET', path, h)", member: 'app.on' }, { desc: 'app.all(path, h)', member: 'app.all' }],
    hono: [{ desc: 'app.get(path, h)', member: 'app.get' }, { desc: "app.on('GET', path, h)", member: 'app.on' }],
    express: [{ desc: 'app.get(path, h)', member: 'app.get' }, { desc: "app.route(path).get(h)", member: 'app.route' }, { desc: 'express.Router().get(path, h)', member: 'sub.get' }],
    h3: [{ desc: 'router.get(path, h)', member: 'sub.get' }, { desc: "router.add('GET', path, h)", member: 'sub.add' }, { desc: 'app.use(path, handler)', member: 'app.use' }],
  },
  '02-mounting': {
    ch3: [{ desc: 'app.route(prefix, sub)', member: 'app.route' }],
    hono: [{ desc: 'app.route(prefix, sub)', member: 'app.route' }, { desc: 'sub.basePath(prefix)', member: 'sub.basePath' }, { desc: 'app.mount(prefix, sub)', member: 'app.mount' }],
    express: [{ desc: "app.use(prefix, router)", member: 'app.use' }],
    h3: [{ desc: "app.use('/p/**', useBase('/p', r.handler))", member: 'app.use' }, { desc: "router.use('/p/**', useBase(...))", member: 'sub.use' }],
  },
  '03-versioned-405': {
    ch3: [{ desc: 'app.route(prefix, sub)', member: 'app.route' }],
    hono: [{ desc: 'sub.basePath(prefix)', member: 'sub.basePath' }, { desc: 'app.route(prefix, sub)', member: 'app.route' }],
    express: [{ desc: "app.use(prefix, router)", member: 'app.use' }, { desc: 'app.route(path)', member: 'app.route' }],
    h3: [{ desc: "app.use('/p/**', useBase(...))", member: 'app.use' }, { desc: "router.use('/p/**', useBase(...))", member: 'sub.use' }],
  },
  '04-errors': {
    ch3: [{ desc: 'early return c.status().json() (no error hook exists)', member: 'c.status' }],
    hono: [{ desc: 'app.onError + throw HTTPException', member: 'app.onError' }, { desc: 'return c.json(body, status) early', member: 'c.json' }],
    express: [{ desc: 'next(err) + 4-arity error middleware', member: 'app.use' }, { desc: 'res.status().json() early', member: 'c.status' }],
    h3: [{ desc: 'throw createError({statusCode})', moduleExport: 'createError' }, { desc: 'setResponseStatus + return', moduleExport: 'setResponseStatus' }],
  },
  '05-query': {
    ch3: [{ desc: 'c.req.query(name) single value only — cannot read repeats', member: 'c.req.query', partial: true }, { desc: 'c.req.queryAll() last-wins map — cannot read repeats', member: 'c.req.queryAll', partial: true }],
    hono: [{ desc: 'c.req.queries(name) -> string[]', member: 'c.req.queries' }],
    express: [{ desc: 'req.query auto-parses repeats to arrays', member: 'c.query' }],
    h3: [{ desc: 'getQuery(e) -> repeated keys become arrays', moduleExport: 'getQuery' }],
  },
  '06-precedence': {
    ch3: [{ desc: "'*' tail splat", syntax: true }],
    hono: [{ desc: "'*' wildcard", syntax: true }, { desc: "':seg{regex}' regex param", syntax: true }],
    express: [{ desc: "'*' wildcard", syntax: true }, { desc: "'(regex)' in path / RegExp path", syntax: true }],
    h3: [{ desc: "'**' wildcard", syntax: true }],
  },
  '07-traps': { ch3: [], hono: [], express: [], h3: [] },
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function countLoc(src: string): number {
  let n = 0
  let inBlock = false
  for (const line of src.split('\n')) {
    let s = line.trim()
    if (inBlock) {
      const end = s.indexOf('*/')
      if (end < 0) continue
      s = s.slice(end + 2).trim()
      inBlock = false
    }
    if (s.startsWith('/*')) {
      const end = s.indexOf('*/', 2)
      if (end < 0) {
        inBlock = true
        continue
      }
      s = s.slice(end + 2).trim()
    }
    if (s === '' || s.startsWith('//')) continue
    n++
  }
  return n
}

function countImports(src: string): { statements: number; names: number } {
  let statements = 0
  let names = 0
  const re = /import\s+([^'"]*?)\s+from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    statements++
    const clause = m[1].trim()
    if (clause.startsWith('{')) {
      const inner = clause.replace(/[{}]/g, '')
      names += inner.split(',').filter((s) => s.trim() !== '').length
    } else if (clause.startsWith('*')) {
      names += 1
    } else {
      const brace = clause.indexOf('{')
      if (brace >= 0) {
        names += 1 + clause.slice(brace).replace(/[{}]/g, '').split(',').filter((s) => s.trim() !== '').length
      } else {
        names += 1
      }
    }
  }
  return { statements, names }
}

// ---------------------------------------------------------------------------
// Type-checking helpers
// ---------------------------------------------------------------------------

function diagsFor(file: string): ts.Diagnostic[] {
  const program = ts.createProgram([file], COMPILER_OPTIONS)
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file !== undefined && path.resolve(d.file.fileName) === path.resolve(file))
}

interface ProbeExpectation {
  id: string
  line: number
}

function probeFile(file: string): { expectations: { id: string; line: number; caught: boolean; message: string }[]; strayDiags: string[] } {
  const src = fs.readFileSync(file, 'utf-8')
  const markerRe = /@dx-expect-error\[([^\]]+)\]/
  const expectations: ProbeExpectation[] = []
  src.split('\n').forEach((line, i) => {
    const m = markerRe.exec(line)
    if (m) expectations.push({ id: m[1], line: i + 1 })
  })
  const diags = diagsFor(file)
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true)
  const errLines = new Map<number, string[]>()
  for (const d of diags) {
    if (d.start === undefined) continue
    const { line } = ts.getLineAndCharacterOfPosition(sf, d.start)
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    const arr = errLines.get(line + 1) || []
    arr.push(msg)
    errLines.set(line + 1, arr)
  }
  const markedLines = new Set(expectations.map((e) => e.line))
  const strayDiags: string[] = []
  for (const [line, msgs] of errLines) {
    if (!markedLines.has(line)) {
      strayDiags.push(`L${line}: ${msgs.join(' | ')}`)
    }
  }
  return {
    expectations: expectations.map((e) => {
      const msgs = errLines.get(e.line) || []
      return { id: e.id, line: e.line, caught: msgs.length > 0, message: msgs.join(' | ') }
    }),
    strayDiags,
  }
}

// ---------------------------------------------------------------------------
// API surface inspection
// ---------------------------------------------------------------------------

function surfaceReport(subject: Subject): Record<string, { exists: boolean; signatures: number }> {
  const file = path.join(DIR, 'surface', `${subject}.surface.ts`)
  const program = ts.createProgram([file], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(file)
  const out: Record<string, { exists: boolean; signatures: number }> = {}
  if (!sf) return out
  const moduleSym = checker.getSymbolAtLocation(sf)
  if (!moduleSym) return out
  const exportsMap = new Map<string, ts.Symbol>()
  checker.getExportsOfModule(moduleSym).forEach((s) => exportsMap.set(s.getName(), s))

  const roots = ['app', 'sub', 'Router', 'c']
  const queue = roots.map((r) => r)
  // Walk dotted member paths up to depth 4 on each root.
  for (const root of queue) {
    const rootSym = exportsMap.get(root)
    if (!rootSym) {
      out[root] = { exists: false, signatures: 0 }
      continue
    }
    const type = checker.getTypeOfSymbolAtLocation(rootSym, sf)
    out[root] = { exists: type !== undefined, signatures: type ? type.getCallSignatures().length : 0 }
    const walk = (t: ts.Type, prefix: string, depth: number) => {
      if (depth <= 0) return
      for (const prop of t.getProperties()) {
        const name = prop.getName()
        if (name.startsWith('_')) continue
        const decl = prop.valueDeclaration || prop.declarations?.[0] || sf
        const pt = checker.getTypeOfSymbolAtLocation(prop, decl)
        const sigs = pt.getCallSignatures().length
        out[`${prefix}.${name}`] = { exists: true, signatures: sigs }
        // Recurse into objects that carry nested API (req, res, context, params, node).
        if (['req', 'res', 'context', 'params', 'node'].includes(name) && sigs === 0) {
          walk(pt, `${prefix}.${name}`, depth - 1)
        }
      }
    }
    walk(type, root, 4)
  }
  return out
}

// ---------------------------------------------------------------------------
// Runtime checks
// ---------------------------------------------------------------------------

// Traps measure what escapes a framework's dispatch. An unhandled rejection
// from an async handler is real evidence (it would take a production process
// down); capture it so the harness itself survives and the client-side hang
// is what gets recorded.
const rejections: string[] = []
process.on('unhandledRejection', (e) => {
  rejections.push(e instanceof Error ? e.message : String(e))
})

async function runTaskChecks(subject: Subject, task: Task): Promise<CheckResult[]> {
  const modPath = path.join(DIR, 'subjects', subject, `${task}.ts`)
  if (!fs.existsSync(modPath)) return []
  const mod = await import(modPath)
  const listener: Listener = mod.default()
  const server = http.createServer(listener)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`
  const results: CheckResult[] = []
  for (const chk of TASK_CHECKS[task]) {
    const observed: CheckResult['observed'] = { status: 'n/a', body: '', headers: {} }
    let pass: boolean | null = null
    let detail: string | undefined
    try {
      const res = await fetch(base + chk.path, {
        method: chk.method,
        body: chk.body,
        headers: chk.headers,
        signal: AbortSignal.timeout(4000),
      })
      const bodyText = await res.text()
      observed.status = res.status
      observed.body = bodyText.slice(0, 300)
      for (const h of ['allow', 'x-guard', 'content-type']) {
        observed.headers[h] = res.headers.get(h)
      }
      if (chk.expect) {
        detail = chk.expect({ status: res.status, body: bodyText, headers: observed.headers }) ?? undefined
        pass = detail === undefined
      }
    } catch (e) {
      const msg = e instanceof Error ? e.name + ': ' + e.message : String(e)
      observed.status = 'unreachable'
      observed.body = msg
      if (chk.expect) {
        pass = false
        detail = `request failed: ${msg}`
      }
    }
    results.push({ desc: chk.desc, pass, observed, detail })
  }
  server.close()
  await new Promise((r) => setTimeout(r, 50))
  return results
}

// ---------------------------------------------------------------------------
// Ways check
// ---------------------------------------------------------------------------

function verifyWays(subject: Subject, task: Task, surface: Record<string, { exists: boolean; signatures: number }>, moduleExports: Set<string>): { desc: string; verified: boolean; partial: boolean; via: string }[] {
  return WAYS[task][subject].map((c) => {
    const partial = c.partial === true
    if (c.member) {
      const ent = surface[c.member]
      return { desc: c.desc, verified: ent !== undefined && ent.exists && !partial, partial, via: 'member:' + c.member }
    }
    if (c.moduleExport) {
      return { desc: c.desc, verified: moduleExports.has(c.moduleExport) && !partial, partial, via: 'export:' + c.moduleExport }
    }
    return { desc: c.desc, verified: !partial, partial, via: 'syntax' }
  })
}

const SUBJECT_MODULE: Record<Subject, string> = { ch3: '@sigilco/ch3', hono: 'hono', express: 'express', h3: 'h3' }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TaskResult {
  compiles: boolean | null
  compileErrors: string[]
  loc: number | null
  imports: { statements: number; names: number } | null
  checks: CheckResult[]
  conform: { pass: number; total: number }
}

interface SubjectResult {
  tasks: Record<string, TaskResult>
  probes: { file: string; expectations: { id: string; line: number; caught: boolean; message: string }[]; strayDiags: string[] }[]
  probeScore: { caught: number; total: number }
  surface: Record<string, { exists: boolean; signatures: number }>
  ways: Record<string, { desc: string; verified: boolean; via: string }[]>
  waysFlagged: string[]
}

const results: Record<string, SubjectResult> = {}

for (const subject of SUBJECTS) {
  const sr: SubjectResult = { tasks: {}, probes: [], probeScore: { caught: 0, total: 0 }, surface: {}, ways: {}, waysFlagged: [] }
  results[subject] = sr

  // Surface + module exports (for ways verification)
  sr.surface = surfaceReport(subject)
  let moduleExports = new Set<string>()
  try {
    const modPath = subject === 'ch3' ? path.join(DIR, '..', '..', 'src', 'index.ts') : SUBJECT_MODULE[subject]
    const mod = await import(modPath)
    moduleExports = new Set(Object.keys(mod))
  } catch (e) {
    console.error(`surface module import failed for ${subject}:`, e)
  }

  for (const task of TASKS) {
    const file = path.join(DIR, 'subjects', subject, `${task}.ts`)
    const tr: TaskResult = { compiles: null, compileErrors: [], loc: null, imports: null, checks: [], conform: { pass: 0, total: 0 } }
    sr.tasks[task] = tr
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf-8')
    tr.loc = countLoc(src)
    tr.imports = countImports(src)
    const diags = diagsFor(file)
    tr.compiles = diags.length === 0
    tr.compileErrors = diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
    const rejBefore = rejections.length
    tr.checks = await runTaskChecks(subject, task)
    if (rejections.length > rejBefore) {
      tr.checks.push({
        desc: 'unhandledRejection observed',
        pass: false,
        observed: { status: 'process-level', body: rejections.slice(rejBefore).join(' | '), headers: {} },
        detail: 'a handler rejection escaped the framework dispatch path',
      })
    }
    for (const c of tr.checks) {
      if (c.pass !== null) {
        tr.conform.total++
        if (c.pass) tr.conform.pass++
      }
    }
    sr.ways[task] = verifyWays(subject, task, sr.surface, moduleExports)
    const n = sr.ways[task].filter((w) => w.verified).length
    if (n > 1) sr.waysFlagged.push(task)
  }

  // Probes
  const probeDir = path.join(DIR, 'probes', subject)
  if (fs.existsSync(probeDir)) {
    for (const f of fs.readdirSync(probeDir).filter((f) => f.endsWith('.ts'))) {
      const r = probeFile(path.join(probeDir, f))
      sr.probes.push({ file: `probes/${subject}/${f}`, ...r })
      for (const e of r.expectations) {
        sr.probeScore.total++
        if (e.caught) sr.probeScore.caught++
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring (weights per RUBRIC.md: type-safety 0.5, determinism 0.3, ergonomics 0.2)
// ---------------------------------------------------------------------------

const W_TYPESAFETY = 0.5
const W_DETERMINISM = 0.3
const W_ERGONOMICS = 0.2

interface AxisScores {
  typeSafety: number
  determinism: number
  ergonomics: number
  total: number
}

const scores: Record<string, AxisScores & { compileRate: number; probeRate: number; conformRate: number; singleWayRate: number; locAvg: number; importAvg: number }> = {}

// LOC/import normalization across subjects per task
for (const subject of SUBJECTS) {
  const sr = results[subject]
  let compilePass = 0
  let conformPass = 0
  let conformTotal = 0
  let singleWay = 0
  let wayTasks = 0
  let locSum = 0
  let locN = 0
  let impSum = 0
  let impN = 0
  const taskScores: Record<string, number> = {}
  for (const task of TASKS) {
    const tr = sr.tasks[task]
    if (tr.compiles === null) continue
    if (tr.compiles) compilePass++
    conformPass += tr.conform.pass
    conformTotal += tr.conform.total
    const verifiedWays = (sr.ways[task] || []).filter((w) => w.verified)
    if (verifiedWays.length > 0 || WAYS[task][subject].length > 0) {
      wayTasks++
      if (verifiedWays.length === 1) singleWay++
    }
    if (tr.loc !== null) {
      locSum += tr.loc
      locN++
    }
    if (tr.imports) {
      impSum += tr.imports.names
      impN++
    }
  }
  const compileRate = TASKS.length > 0 ? compilePass / TASKS.length : 0
  const probeRate = sr.probeScore.total > 0 ? sr.probeScore.caught / sr.probeScore.total : 0
  const conformRate = conformTotal > 0 ? conformPass / conformTotal : 0
  const singleWayRate = wayTasks > 0 ? singleWay / wayTasks : 1
  const locAvg = locN > 0 ? locSum / locN : 0
  const importAvg = impN > 0 ? impSum / impN : 0
  scores[subject] = {
    typeSafety: 0,
    determinism: 0,
    ergonomics: 0,
    total: 0,
    compileRate,
    probeRate,
    conformRate,
    singleWayRate,
    locAvg,
    importAvg,
  }
}

// Normalize LOC/imports across subjects: best (lowest avg) = 1.0
const locVals = SUBJECTS.map((s) => scores[s].locAvg).filter((v) => v > 0)
const impVals = SUBJECTS.map((s) => scores[s].importAvg).filter((v) => v > 0)
const locMin = Math.min(...locVals)
const locMax = Math.max(...locVals)
const impMin = Math.min(...impVals)
const impMax = Math.max(...impVals)

for (const subject of SUBJECTS) {
  const s = scores[subject]
  const locScore = locMax === locMin ? 1 : 1 - (s.locAvg - locMin) / (locMax - locMin)
  const impScore = impMax === impMin ? 1 : 1 - (s.importAvg - impMin) / (impMax - impMin)
  s.typeSafety = 0.3 * s.compileRate + 0.7 * s.probeRate
  s.determinism = 0.5 * s.singleWayRate + 0.5 * s.conformRate
  s.ergonomics = 0.5 * locScore + 0.5 * impScore
  s.total = W_TYPESAFETY * s.typeSafety + W_DETERMINISM * s.determinism + W_ERGONOMICS * s.ergonomics
}

// ---------------------------------------------------------------------------
// Emit scorecard.json + RESULTS.md
// ---------------------------------------------------------------------------

const scorecard = {
  generated: new Date().toISOString(),
  subjects: SUBJECTS,
  weights: { typeSafety: W_TYPESAFETY, determinism: W_DETERMINISM, ergonomics: W_ERGONOMICS },
  scores,
  results,
}
fs.writeFileSync(path.join(DIR, 'scorecard.json'), JSON.stringify(scorecard, null, 2))

function fmtObserved(c: CheckResult): string {
  const o = c.observed
  const extras = Object.entries(o.headers)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  const body = o.body.replace(/\n/g, ' ').slice(0, 90)
  return `${o.status}${extras ? ' [' + extras + ']' : ''}${body ? ' ' + body : ''}`
}

function renderResults(): string {
  const L: string[] = []
  L.push('# DX eval scorecard — ch3 vs hono vs express vs h3')
  L.push('')
  L.push(`Generated by \`eval/dx/judge.ts\` on ${new Date().toISOString()}. Re-run: \`cd eval/dx && npx tsx judge.ts\`.`)
  L.push('')
  L.push('Axis weights (rubric order — type-safety heaviest): type-safety 0.50, determinism 0.30, ergonomics 0.20.')
  L.push('Deterministic parts are script-verified; LLM-judged axes live in `judge-output/` (see JUDGE-PROMPT.md).')
  L.push('')
  L.push('## Totals')
  L.push('')
  L.push('| Subject | Type-safety | Determinism | Ergonomics | Weighted total |')
  L.push('|---|---|---|---|---|')
  for (const s of SUBJECTS) {
    const sc = scores[s]
    L.push(`| ${s} | ${sc.typeSafety.toFixed(2)} | ${sc.determinism.toFixed(2)} | ${sc.ergonomics.toFixed(2)} | **${sc.total.toFixed(2)}** |`)
  }
  L.push('')
  L.push('Sub-scores: compileRate, probeRate (trap lines caught by tsc), conformRate (runtime assertions), singleWayRate (tasks with exactly one API way), avg LOC/imports per task.')
  L.push('')
  L.push('| Subject | compile | probes | conform | singleWay | avg LOC | avg imports |')
  L.push('|---|---|---|---|---|---|---|')
  for (const s of SUBJECTS) {
    const sc = scores[s]
    const r = results[s]
    L.push(`| ${s} | ${(sc.compileRate * 100).toFixed(0)}% | ${r.probeScore.caught}/${r.probeScore.total} | ${(sc.conformRate * 100).toFixed(0)}% | ${(sc.singleWayRate * 100).toFixed(0)}% | ${sc.locAvg.toFixed(1)} | ${sc.importAvg.toFixed(1)} |`)
  }
  L.push('')
  L.push('## Per-task')
  L.push('')
  L.push('| Task | Subject | tsc | LOC | imports | conform | ways (verified) |')
  L.push('|---|---|---|---|---|---|---|')
  for (const task of TASKS) {
    for (const s of SUBJECTS) {
      const tr = results[s].tasks[task]
      if (!tr || tr.compiles === null) continue
      const ways =
        (results[s].ways[task] || [])
          .map((w) => (w.verified ? w.desc : w.partial ? w.desc + ' _(partial)_' : null))
          .filter((w) => w !== null)
          .join('<br>') || '-'
      const nVerified = (results[s].ways[task] || []).filter((w) => w.verified).length
      const flag = nVerified > 1 ? ' **>1 way**' : nVerified === 0 && (results[s].ways[task] || []).length > 0 ? ' **no native way**' : ''
      L.push(`| ${task} | ${s} | ${tr.compiles ? 'ok' : 'FAIL'} | ${tr.loc} | ${tr.imports?.names} | ${tr.conform.pass}/${tr.conform.total} | ${ways}${flag} |`)
    }
  }
  L.push('')
  L.push('## Trap probes (does tsc catch the mistake?)')
  L.push('')
  L.push('| Trap | Subject | caught | diagnostic |')
  L.push('|---|---|---|---|')
  for (const s of SUBJECTS) {
    for (const p of results[s].probes) {
      for (const e of p.expectations) {
        L.push(`| ${e.id} | ${s} | ${e.caught ? 'yes' : '**no**'} | ${e.caught ? e.message.replace(/\|/g, '\\|').slice(0, 140) : '—'} |`)
      }
    }
  }
  L.push('')
  L.push('## Runtime observations (recorded verbatim)')
  L.push('')
  for (const task of TASKS) {
    L.push(`### ${task}`)
    L.push('')
    L.push('| Check | Subject | Result | Observed |')
    L.push('|---|---|---|---|')
    for (const s of SUBJECTS) {
      const tr = results[s].tasks[task]
      if (!tr) continue
      for (const c of tr.checks) {
        const mark = c.pass === null ? 'rec' : c.pass ? 'pass' : 'FAIL'
        L.push(`| ${c.desc} | ${s} | ${mark} | ${fmtObserved(c)} |`)
      }
    }
    L.push('')
  }
  return L.join('\n')
}

fs.writeFileSync(path.join(DIR, 'RESULTS.md'), renderResults())

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(scorecard, null, 2))
} else {
  console.log('scorecard.json + RESULTS.md written')
  for (const s of SUBJECTS) {
    const sc = scores[s]
    console.log(`${s.padEnd(8)} total=${sc.total.toFixed(2)}  type=${sc.typeSafety.toFixed(2)} det=${sc.determinism.toFixed(2)} erg=${sc.ergonomics.toFixed(2)}`)
  }
}
