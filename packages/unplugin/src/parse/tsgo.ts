// tsgo adapter — the seam over `typescript/sync` (the typescript-go native
// compiler's client API, on typescript 7.x nightlies). EXPERIMENTAL.
//
// Unlike classic, parsing runs in a spawned tsgo server process; the client
// lazily decodes the binary wire format into RemoteNode objects (in-package,
// dist/api/node/) that structurally satisfy the seam's node shapes, so the
// casts below are erasure-only, never re-shaping.
//
// The nightly API is explicitly unstable: breaking changes between nightlies
// are expected. This module imports nothing at load — `typescript/sync` is
// require()d lazily inside parse() — so installs without the nightly never
// load tsgo code (classic.ts stays the only static parser import).
//
// Wire protocol notes (verified against typescript@7.1.0-dev.20261012.1,
// subpath map typescript/sync + typescript/ast):
//   - `new API({})` spawns the bundled native tsc and connects over a socket.
//   - api.createSourceFile(fileName, text, { scriptKind }) is synchronous
//     (the sync channel blocks with Atomics.wait) and returns
//     RetainedSourceFile { sourceFile, lease }.
//   - sourceFile.statements is a RemoteNodeList (an Array subclass).
//   - RemoteNode exposes classic-shaped getters: .kind, .text (Identifier/
//     literals/templates, via the string table), named child properties
//     (.expression, .arguments, .name, .initializer, .parameters, .body,
//     .statements, .modifiers, .isExportEquals, ...), .forEachChild(cb)
//     (arrays flattened into the visitor, matching classic ts.forEachChild),
//     .getStart(sf), and sourceFile.getLineAndCharacterOfPosition.
//   - Disposing the lease frees the server-side source file, but already
//     materialized RemoteNodes keep working (they read the local buffer), so
//     disposing right after parse keeps server memory flat per module.

import { createRequire } from "node:module";
import type {
  AstSource,
  ArrayLiteralExpression,
  BinaryExpression,
  Block,
  CallExpression,
  ExportAssignment,
  ExportDeclaration,
  ExpressionStatement,
  FunctionLike,
  Identifier,
  ImportDeclaration,
  Kinds,
  NamedExports,
  NamedImports,
  NamespaceImport,
  Node,
  NumericLiteral,
  ObjectLiteralExpression,
  Parser,
  ParenthesizedExpression,
  PrefixUnaryExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  ReturnStatement,
  Statement,
  StringLiteral,
  VariableStatement,
} from "./types.ts";

// ---- minimal structural shape of the nightly client -------------------------
// Kept local (never imported at typecheck time) so this package keeps
// typechecking against plain typescript 5.9. Names mirror the real API:
// dist/api/sync/api.d.ts, dist/ast/index.d.ts.

interface TsgoSyntaxKind {
  StringLiteral: number;
  NoSubstitutionTemplateLiteral: number;
  NumericLiteral: number;
  PrefixUnaryExpression: number;
  BinaryExpression: number;
  ArrayLiteralExpression: number;
  ObjectLiteralExpression: number;
  PropertyAssignment: number;
  Identifier: number;
  ParenthesizedExpression: number;
  CallExpression: number;
  PropertyAccessExpression: number;
  ArrowFunction: number;
  FunctionExpression: number;
  Block: number;
  ReturnStatement: number;
  ImportDeclaration: number;
  NamedImports: number;
  NamespaceImport: number;
  VariableStatement: number;
  ExportAssignment: number;
  ExportDeclaration: number;
  NamedExports: number;
  ExpressionStatement: number;
  TrueKeyword: number;
  FalseKeyword: number;
  NullKeyword: number;
  MinusToken: number;
  PlusToken: number;
  ExportKeyword: number;
}

// RemoteNode's surface used beyond the seam's structural fields.
interface TsgoNode {
  kind: number;
  forEachChild(visitor: (child: TsgoNode) => void): unknown;
  getStart(sf: TsgoSourceFile): number;
}

interface TsgoSourceFile {
  statements: TsgoNode[];
  getLineAndCharacterOfPosition(pos: number): { line: number };
}

interface TsgoRetained {
  sourceFile: TsgoSourceFile;
  dispose(): void;
}

interface TsgoApi {
  createSourceFile(fileName: string, text: string, options?: { scriptKind?: number }): TsgoRetained;
}

interface TsgoApiCtor {
  new (options?: Record<string, unknown>): TsgoApi;
}

// ---- adapter ----------------------------------------------------------------

// Probe whether a tsgo nightly is resolvable, without loading it: tests use
// this to skip integration suites when the nightly is absent. Never spawns
// a server, never throws.
export function tsgoAvailable(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve("typescript/sync");
    return true;
  } catch {
    return false;
  }
}

export class TsgoParser implements Parser {
  k: Kinds;
  private kind: TsgoSyntaxKind | null;
  private scriptKindTS: number;
  private scriptKindJS: number;
  private api: TsgoApi | null;
  private failed: boolean;

  constructor() {
    this.k = {} as Kinds;
    this.kind = null;
    this.scriptKindTS = 3;
    this.scriptKindJS = 1;
    this.api = null;
    this.failed = false;
  }

  // Load the nightly client on first parse. Node >= 22.12 can require()
  // ESM synchronously, which is what makes a sync Parser.parse() over
  // `typescript/sync` possible at all. Only builtins are imported statically;
  // no tsgo module is evaluated until load().
  private load(): void {
    if (this.api !== null) {
      return;
    }
    const req = createRequire(import.meta.url);
    const { API } = req("typescript/sync") as { API: TsgoApiCtor };
    const ast = req("typescript/ast") as {
      SyntaxKind: TsgoSyntaxKind;
      ScriptKind: { TS: number; JS: number };
    };
    this.kind = ast.SyntaxKind;
    this.scriptKindTS = ast.ScriptKind.TS;
    this.scriptKindJS = ast.ScriptKind.JS;
    this.k = {
      TrueKeyword: ast.SyntaxKind.TrueKeyword,
      FalseKeyword: ast.SyntaxKind.FalseKeyword,
      NullKeyword: ast.SyntaxKind.NullKeyword,
      MinusToken: ast.SyntaxKind.MinusToken,
      PlusToken: ast.SyntaxKind.PlusToken,
      ExportKeyword: ast.SyntaxKind.ExportKeyword,
    };
    this.api = new API({});
  }

  parse(fileName: string, code: string): AstSource {
    if (this.failed) {
      throw new Error(
        "unplugin-chttp: tsgo parser failed to initialize earlier; refusing to retry (use parser: 'classic')",
      );
    }
    try {
      this.load();
    } catch (e) {
      this.failed = true;
      throw new Error(
        "unplugin-chttp: tsgo parser requires typescript@next (7.x nightly) providing the 'typescript/sync' subpath; got: " +
          String(e),
      );
    }
    const api = this.api as TsgoApi;
    const sk = /\.m?js$/i.test(fileName) ? this.scriptKindJS : this.scriptKindTS;
    const retained = api.createSourceFile(fileName, code, { scriptKind: sk });
    const sf = retained.sourceFile;
    retained.dispose();
    return {
      statements: sf.statements as unknown as Statement[],
      lineOf(n: Node): number {
        const t = n as unknown as TsgoNode;
        return sf.getLineAndCharacterOfPosition(t.getStart(sf)).line + 1;
      },
    };
  }

  forEachChild(n: Node, cb: (child: Node) => void): void {
    (n as unknown as TsgoNode).forEachChild(cb as (child: TsgoNode) => void);
  }

  private is(name: keyof TsgoSyntaxKind, n: Node): boolean {
    const table = this.kind as TsgoSyntaxKind;
    return n.kind === table[name];
  }

  isStringLiteral(n: Node): n is StringLiteral {
    return this.is("StringLiteral", n);
  }
  isNoSubstitutionTemplateLiteral(n: Node): n is StringLiteral {
    return this.is("NoSubstitutionTemplateLiteral", n);
  }
  isNumericLiteral(n: Node): n is NumericLiteral {
    return this.is("NumericLiteral", n);
  }
  isPrefixUnaryExpression(n: Node): n is PrefixUnaryExpression {
    return this.is("PrefixUnaryExpression", n);
  }
  isBinaryExpression(n: Node): n is BinaryExpression {
    return this.is("BinaryExpression", n);
  }
  isArrayLiteralExpression(n: Node): n is ArrayLiteralExpression {
    return this.is("ArrayLiteralExpression", n);
  }
  isObjectLiteralExpression(n: Node): n is ObjectLiteralExpression {
    return this.is("ObjectLiteralExpression", n);
  }
  isPropertyAssignment(n: Node): n is PropertyAssignment {
    return this.is("PropertyAssignment", n);
  }
  isIdentifier(n: Node): n is Identifier {
    return this.is("Identifier", n);
  }
  isParenthesizedExpression(n: Node): n is ParenthesizedExpression {
    return this.is("ParenthesizedExpression", n);
  }
  isCallExpression(n: Node): n is CallExpression {
    return this.is("CallExpression", n);
  }
  isPropertyAccessExpression(n: Node): n is PropertyAccessExpression {
    return this.is("PropertyAccessExpression", n);
  }
  isArrowFunction(n: Node): n is FunctionLike {
    return this.is("ArrowFunction", n);
  }
  isFunctionExpression(n: Node): n is FunctionLike {
    return this.is("FunctionExpression", n);
  }
  isBlock(n: Node): n is Block {
    return this.is("Block", n);
  }
  isReturnStatement(n: Node): n is ReturnStatement {
    return this.is("ReturnStatement", n);
  }

  isImportDeclaration(n: Node): n is ImportDeclaration {
    return this.is("ImportDeclaration", n);
  }
  isNamedImports(n: Node): n is NamedImports {
    return this.is("NamedImports", n);
  }
  isNamespaceImport(n: Node): n is NamespaceImport {
    return this.is("NamespaceImport", n);
  }
  isVariableStatement(n: Node): n is VariableStatement {
    return this.is("VariableStatement", n);
  }
  isExportAssignment(n: Node): n is ExportAssignment {
    return this.is("ExportAssignment", n);
  }
  isExportDeclaration(n: Node): n is ExportDeclaration {
    return this.is("ExportDeclaration", n);
  }
  isNamedExports(n: Node): n is NamedExports {
    return this.is("NamedExports", n);
  }
  isExpressionStatement(n: Node): n is ExpressionStatement {
    return this.is("ExpressionStatement", n);
  }
}
