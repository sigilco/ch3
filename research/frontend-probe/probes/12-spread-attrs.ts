const base: { id: string; className: string } = { id: "n", className: "x" };
const extra: { id: string; className: string; href: string } = { ...base, href: "/" };
console.log(extra.id + extra.href);
