// scriptc-friendly "component" registry: parallel arrays, no fn-in-record

type RenderFn = () => string;

const _fns: RenderFn[] = [];
const _names: string[] = [];

function register(name: string, fn: RenderFn): number {
  const i = _fns.length;
  _fns.push(fn);
  _names.push(name);
  return i;
}

function render(i: number): string {
  return _fns[i]();
}

const IDX_TITLE = register("title", (): string => {
  return "<h1>Title</h1>";
});

console.log(render(IDX_TITLE));
