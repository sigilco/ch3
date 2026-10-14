// Classic adapter — the seam over `typescript` (tsc 5.x/6.x). Nodes ARE
// ts nodes: the interface shapes in types.ts hold structurally, so the
// casts below are erasure-only, never re-shaping.

import ts from "typescript";
import type {
  AstSource,
  BinaryExpression,
  Block,
  CallExpression,
  ExportAssignment,
  ExportDeclaration,
  Expression,
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
  RegularExpressionLiteral,
  ReturnStatement,
  Statement,
  StringLiteral,
  VariableStatement,
} from "./types.ts";

export class ClassicParser implements Parser {
  k: Kinds;

  constructor() {
    this.k = {
      TrueKeyword: ts.SyntaxKind.TrueKeyword,
      FalseKeyword: ts.SyntaxKind.FalseKeyword,
      NullKeyword: ts.SyntaxKind.NullKeyword,
      MinusToken: ts.SyntaxKind.MinusToken,
      PlusToken: ts.SyntaxKind.PlusToken,
      ExportKeyword: ts.SyntaxKind.ExportKeyword,
    };
  }

  parse(fileName: string, code: string): AstSource {
    const sk = /\.m?js$/i.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, sk);
    return {
      statements: sf.statements as unknown as Statement[],
      lineOf(n: Node): number {
        const tsn = n as unknown as ts.Node;
        return sf.getLineAndCharacterOfPosition(tsn.getStart(sf)).line + 1;
      },
    };
  }

  forEachChild(n: Node, cb: (child: Node) => void): void {
    ts.forEachChild(n as unknown as ts.Node, cb as (c: ts.Node) => void);
  }

  isStringLiteral(n: Node): n is StringLiteral {
    return ts.isStringLiteral(n as unknown as ts.Node);
  }
  isNoSubstitutionTemplateLiteral(n: Node): n is StringLiteral {
    return ts.isNoSubstitutionTemplateLiteral(n as unknown as ts.Node);
  }
  isNumericLiteral(n: Node): n is NumericLiteral {
    return ts.isNumericLiteral(n as unknown as ts.Node);
  }
  isPrefixUnaryExpression(n: Node): n is PrefixUnaryExpression {
    return ts.isPrefixUnaryExpression(n as unknown as ts.Node);
  }
  isBinaryExpression(n: Node): n is BinaryExpression {
    return ts.isBinaryExpression(n as unknown as ts.Node);
  }
  isArrayLiteralExpression(n: Node): n is Node & { elements: Expression[] } {
    return ts.isArrayLiteralExpression(n as unknown as ts.Node);
  }
  isObjectLiteralExpression(n: Node): n is ObjectLiteralExpression {
    return ts.isObjectLiteralExpression(n as unknown as ts.Node);
  }
  isPropertyAssignment(n: Node): n is PropertyAssignment {
    return ts.isPropertyAssignment(n as unknown as ts.Node);
  }
  isIdentifier(n: Node): n is Identifier {
    return ts.isIdentifier(n as unknown as ts.Node);
  }
  isParenthesizedExpression(n: Node): n is ParenthesizedExpression {
    return ts.isParenthesizedExpression(n as unknown as ts.Node);
  }
  isCallExpression(n: Node): n is CallExpression {
    return ts.isCallExpression(n as unknown as ts.Node);
  }
  isPropertyAccessExpression(n: Node): n is PropertyAccessExpression {
    return ts.isPropertyAccessExpression(n as unknown as ts.Node);
  }
  isArrowFunction(n: Node): n is FunctionLike {
    return ts.isArrowFunction(n as unknown as ts.Node);
  }
  isFunctionExpression(n: Node): n is FunctionLike {
    return ts.isFunctionExpression(n as unknown as ts.Node);
  }
  isBlock(n: Node): n is Block {
    return ts.isBlock(n as unknown as ts.Node);
  }
  isReturnStatement(n: Node): n is ReturnStatement {
    return ts.isReturnStatement(n as unknown as ts.Node);
  }
  isRegularExpressionLiteral(n: Node): n is RegularExpressionLiteral {
    return ts.isRegularExpressionLiteral(n as unknown as ts.Node);
  }

  isImportDeclaration(n: Node): n is ImportDeclaration {
    return ts.isImportDeclaration(n as unknown as ts.Node);
  }
  isNamedImports(n: Node): n is NamedImports {
    return ts.isNamedImports(n as unknown as ts.Node);
  }
  isNamespaceImport(n: Node): n is NamespaceImport {
    return ts.isNamespaceImport(n as unknown as ts.Node);
  }
  isVariableStatement(n: Node): n is VariableStatement {
    return ts.isVariableStatement(n as unknown as ts.Node);
  }
  isExportAssignment(n: Node): n is ExportAssignment {
    return ts.isExportAssignment(n as unknown as ts.Node);
  }
  isExportDeclaration(n: Node): n is ExportDeclaration {
    return ts.isExportDeclaration(n as unknown as ts.Node);
  }
  isNamedExports(n: Node): n is NamedExports {
    return ts.isNamedExports(n as unknown as ts.Node);
  }
  isExpressionStatement(n: Node): n is ExpressionStatement {
    return ts.isExpressionStatement(n as unknown as ts.Node);
  }
}

export type { Expression } from "./types.ts";
