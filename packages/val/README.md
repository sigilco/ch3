# @chttp/val

Minimal [Standard Schema](https://standardschema.dev) validation library authored inside the scriptc compilable subset. It is the only way to run schema validation inside a chttp binary compiled to a native ELF. In Node mode it performs in the same band as [valibot](https://github.com/open-circle/valibot).

```ts
import * as v from "@chttp/val";

const Order = v.strictObject({
  id: v.pipe(v.string(), v.uuid()),
  items: v.pipe(
    v.array(v.strictObject({ qty: v.pipe(v.number(), v.integer()) })),
    v.minLength(1),
  ),
});

const r = v.safeParse(Order, JSON.parse(body));
if (!r.success) {
  // r.issues: VIssue[] with type/expected/received/message/path
}
```

Every schema exposes `schema["~standard"]` (`{ version: 1, vendor: "val", validate }`), so any Standard Schema consumer can drive it.

## Using results under scriptc

`VSafeResult.issues` is `VIssue[] | null`, and `success` does not narrow it. Narrow `issues` inline:

```ts
const n = r.issues === null ? 0 : r.issues.length;
if (r.issues !== null) {
  // r.issues.length is safe here
}
```

Do not copy it to a local first (`const i = r.issues`); the inferred surface loses `VIssue[]` and scriptc rejects the union (SC2009). A type error anywhere in the program is reported by scriptc as SC2013 against an npm package ("cannot compile npm package ... statically"), even when the package is fine, because the shipped `.d.ts` files are hidden in that mode. Run `tsc --noEmit` first to see the real error.

See the [validation docs](https://github.com/sigilco/chttp/blob/main/docs/validation.md) for the full API surface, the deliberate divergences from valibot (plain-record results, typed `literal`/`optional` slots, no `Issue.input`, `optionalStr`/`optionalNum`/`optionalBool` defaults), and the reasoning that made this package necessary: no npm validator compiles to ELF, and npm schema libraries do not compile into a chttp ELF.
