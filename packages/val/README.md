# @ch3/val

Minimal [Standard Schema](https://standardschema.dev) validation library authored inside the scriptc compilable subset. It is the only way to run schema validation inside a ch3 binary compiled to a native ELF. In Node mode it performs in the same band as [valibot](https://github.com/open-circle/valibot).

```ts
import * as v from "@ch3/val";

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

See the [validation docs](https://github.com/sigilco/ch3/blob/main/docs/validation.md) for the full API surface, the deliberate divergences from valibot (plain-record results, typed `literal`/`optional` slots, no `Issue.input`, `optionalStr`/`optionalNum`/`optionalBool` defaults), and the reasoning that made this package necessary: no npm validator compiles to ELF, and npm schema libraries do not compile into a ch3 ELF.
