**Refactor: route trie-node creation through one factory**

Six sites construct `Node` objects by literal (`createRouter`'s root, the
wildcard/param inserts, the static-child insert, and both suffix-trie inserts in
`_insert`). Each names the full shape inline. Centralizing them behind a small
`createNode(key)` factory in `context.ts`:

- keeps every node's created shape uniform — one hidden class instead of several
  literal-site shapes (matching how `NullProtoObj` already centralizes the
  dictionary shapes), and
- gives future `Node` fields a single initialization site (the interface has grown
  `suffix`/`hasSuffix`/`hasRegexParam` recently; each was added at N sites).

Cost: ~11 B (+9 B gzip) of bundle — the helper outweighs the slightly shorter
literals it replaces; the bundle budget is bumped by exactly that delta. If size
wins, feel free to close; the dedup is the argument, not a must-have.
