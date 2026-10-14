// Parser seam — the narrow AST surface extract.ts consumes.
//
// extract.ts never imports "typescript" directly; it works against these
// structural types and the Parser interface so a future adapter
// (typescript/unstable "tsgo") can drop in without touching extraction
// logic. Model these on EXACTLY what extract.ts reads — widening them
// defeats the seam.
//
// Structural, not nominal: nodes are whatever the active parser produced.
// The classic adapter casts real ts nodes into these shapes (they satisfy
// them structurally); fields not listed here must not be read.

// Base shape: every node carries its parser-specific kind discriminant.
export interface Node {
  kind: number;
}

export interface Expression extends Node {}

// Identifier / StringLiteral / NumericLiteral / template-without-holes all
// surface their source text the same way.
export interface Identifier extends Expression {
  text: string;
}
export interface StringLiteral extends Expression {
  text: string;
}
export interface NumericLiteral extends Expression {
  text: string;
}

// Object-member names: identifier or literal (computed names are rejected
// by guards before any read, so `text` is always present when read).
export interface PropertyName extends Node {
  text: string;
}
export interface MemberName extends Node {
  text: string;
}

export interface PrefixUnaryExpression extends Expression {
  operand: Expression;
  operator: number;
}
export interface BinaryExpression extends Expression {
  operatorToken: Node;
  left: Expression;
  right: Expression;
}
export interface ArrayLiteralExpression extends Expression {
  elements: Expression[];
}
export interface ObjectLiteralExpression extends Expression {
  properties: Node[];
}
export interface PropertyAssignment extends Node {
  name: PropertyName;
  initializer: Expression;
}
export interface ParenthesizedExpression extends Expression {
  expression: Expression;
}
export interface CallExpression extends Expression {
  expression: Expression;
  arguments: Expression[];
}
export interface PropertyAccessExpression extends Expression {
  expression: Expression;
  name: MemberName;
}
// Regex literals (openapi schema-source printing only — extract.ts itself
// never reads flags; presence is enough there).
export interface RegularExpressionLiteral extends Expression {
  text: string;
}

// Arrow functions and function expressions share the consumed shape.
export interface ParameterDeclaration extends Node {
  name: Node;
}
export interface FunctionLike extends Expression {
  parameters: ParameterDeclaration[];
  body: Node; // Block or concise Expression
}
export interface Block extends Node {
  statements: Node[];
}
export interface ReturnStatement extends Node {
  expression?: Expression;
}

// ---- statements ------------------------------------------------------------

export interface Statement extends Node {}
export interface ImportDeclaration extends Statement {
  moduleSpecifier: Expression;
  importClause?: ImportClause;
}
export interface ImportClause extends Node {
  namedBindings?: Node; // NamedImports | NamespaceImport
}
export interface NamedImports extends Node {
  elements: ImportSpecifier[];
}
export interface NamespaceImport extends Node {
  name: Identifier;
}
export interface ImportSpecifier extends Node {
  name: Identifier;
  propertyName?: Identifier;
}
export interface VariableStatement extends Statement {
  modifiers?: Node[];
  declarationList: VariableDeclarationList;
}
export interface VariableDeclarationList extends Node {
  declarations: VariableDeclaration[];
}
export interface VariableDeclaration extends Node {
  name: Node;
  initializer?: Expression;
}
export interface ExpressionStatement extends Statement {
  expression: Expression;
}
export interface ExportAssignment extends Statement {
  isExportEquals: boolean;
  expression: Expression;
}
export interface ExportDeclaration extends Statement {
  exportClause?: Node; // NamedExports
}
export interface NamedExports extends Node {
  elements: ExportSpecifier[];
}
export interface ExportSpecifier extends Node {
  name: Identifier;
  propertyName?: Identifier;
}

// ---- source + parser -------------------------------------------------------

export interface AstSource {
  // Root module statements, in source order.
  statements: Statement[];
  // 1-based line of a node's start position (warning messages).
  lineOf(n: Node): number;
}

// Kind discriminants extract.ts compares against. Values are the active
// parser's own — the adapter supplies them, never hardcode here.
export interface Kinds {
  TrueKeyword: number;
  FalseKeyword: number;
  NullKeyword: number;
  MinusToken: number;
  PlusToken: number;
  ExportKeyword: number;
}

export interface Parser {
  parse(fileName: string, code: string): AstSource;
  k: Kinds;
  // Child traversal in syntax order (nested-call scan).
  forEachChild(n: Node, cb: (child: Node) => void): void;

  isStringLiteral(n: Node): n is StringLiteral;
  isNoSubstitutionTemplateLiteral(n: Node): n is StringLiteral;
  isNumericLiteral(n: Node): n is NumericLiteral;
  isPrefixUnaryExpression(n: Node): n is PrefixUnaryExpression;
  isBinaryExpression(n: Node): n is BinaryExpression;
  isArrayLiteralExpression(n: Node): n is ArrayLiteralExpression;
  isObjectLiteralExpression(n: Node): n is ObjectLiteralExpression;
  isPropertyAssignment(n: Node): n is PropertyAssignment;
  isIdentifier(n: Node): n is Identifier;
  isParenthesizedExpression(n: Node): n is ParenthesizedExpression;
  isCallExpression(n: Node): n is CallExpression;
  isPropertyAccessExpression(n: Node): n is PropertyAccessExpression;
  isArrowFunction(n: Node): n is FunctionLike;
  isFunctionExpression(n: Node): n is FunctionLike;
  isBlock(n: Node): n is Block;
  isReturnStatement(n: Node): n is ReturnStatement;
  isRegularExpressionLiteral(n: Node): n is RegularExpressionLiteral;

  isImportDeclaration(n: Node): n is ImportDeclaration;
  isNamedImports(n: Node): n is NamedImports;
  isNamespaceImport(n: Node): n is NamespaceImport;
  isVariableStatement(n: Node): n is VariableStatement;
  isExportAssignment(n: Node): n is ExportAssignment;
  isExportDeclaration(n: Node): n is ExportDeclaration;
  isNamedExports(n: Node): n is NamedExports;
  isExpressionStatement(n: Node): n is ExpressionStatement;
}
