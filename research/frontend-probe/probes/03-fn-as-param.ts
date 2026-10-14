function layout(renderBody: () => string): string {
  return "<html><body>" + renderBody() + "</body></html>";
}

function hello(name: string): string {
  return "<h1>" + name + "</h1>";
}

console.log(
  layout(function (): string {
    return hello("Ada");
  }),
);
