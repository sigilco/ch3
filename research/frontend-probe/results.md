# Probe results (scriptc 0.3.1, 2026-10-14)

Host: linux x86_64, Node 24.21.0, `scriptc build` default release.

## Coverage / ELF

| id | coverage | ELF vs Node |
|---|---|---|
| 01-tagged-template | 53/53 (100%) | MATCH `<h1>Hello Ada</h1>` |
| 02-fn-in-record | 3/3 (100%) | MATCH |
| 03-fn-as-param | 4/4 (100%) | MATCH |
| 04-fn-in-array | 7/7 (100%) | MATCH |
| 05-class-component | 4/4 (100%) | MATCH |
| 06-vnode-string-tag | 3/3 (100%) | coverage only |
| 07-vnode-fn-type | 3/3 (100%) | MATCH (homogeneous `type: Comp`) |
| 08-html-class | 55/55 (100%) | MATCH nested + raw |
| 09-mixed-promise-union | 4/10 (40%) SC2009/SC2004 | refused |
| 10-promise-all | 9/9 (100%) | MATCH |
| 11-object-shorthand | 4/4 (100%) | MATCH |
| 12-spread-attrs | 3/3 (100%) | MATCH |
| 13-for-in-attrs | 5/5 (100%) | MATCH |
| 14-map-registry | 3/6 (50%) SC2009/SC2020 | refused |
| 15-attr-pairs | 52/52 (100%) | MATCH |
| 16-regex-escape | 12/12 (100%) | MATCH (ELF 314 KB) |
| 17-replaceall-escape | 3/3 (100%) | MATCH (ELF 101 KB) |
| 18-res-write | 8/8 (100%) | curl returned `<html><body>streamed</body></html>` |
| 19-jsx | SC0001 (no JSX flag / IntrinsicElements) | refused |
| 20-islands-app | 691/691 (100%) | curl OK; ELF 559 KB; RSS 2408 KB |
| 21-escape-bench | 67/67 (100%) | see below |
| 22-template-strings-array | 7/7 (100%) | MATCH |
| 23-nested-fn-components | 53/53 (100%) | MATCH |
| 24-join-html | 54/54 (100%) | MATCH |
| 25-recursive-vnode | 7/7 (100%) | MATCH |
| 26-class-fn-record | 11/11 (100%) | MATCH |
| 27-vnode-fn-children | 8/9 (88%) SC2001 | refused (`string \| Comp` call) |
| 28-vnode-discriminated | 13/13 (100%) | MATCH |

Islands curls:

- `GET /` → `text/html` 309 bytes, inline `<script type="module">`, span `#n`
- `GET /api/count` → `{"n":42}`
- `GET /xss?q=<script>alert(1)</script>` → `&lt;script&gt;alert(1)&lt;/script&gt;` in the span

## Escape microbench

5000 iterations × 2048-char dirty string (`a<>&"'x` cycling). Times in ms, three runs.

| | split/join | charCodeAt |
|---|---|---|
| Node | 278, 315, 321 | 88, 89, 82 |
| ELF | 153, 152, 153 | 80, 82, 81 |

Output length 7606 on every run (escape expansion matched).
