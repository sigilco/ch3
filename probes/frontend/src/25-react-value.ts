declare module "react" {
  export function createElement(type: string, props: null, child: string): string;
}

import { createElement } from "react";

console.log(typeof createElement("p", null, "hi"));
