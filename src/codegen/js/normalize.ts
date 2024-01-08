const SANITIZE_PREFIX = '$';

export function sanitizeKeyword(name: string) {
  if (!reservedWord.has(name)) return name;

  return SANITIZE_PREFIX + name;
}

export function sanitizeProperty(name: string) {
  if (reservedWord.has(name)) return SANITIZE_PREFIX + name;
  if (!reservedProperty.has(name)) return name;

  return `["${name}"]`;
}

const reservedProperty = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  'Array',
  'Date',
  'eval',
  'function',
  'Infinity',
  'isFinite',
  'isNaN',
  'length',
  'Math',
  'NaN',
  'name',
  'Number',
  'Object',
  'String',
  'undefined',
]);

const reservedWord = new Set([
  'do',
  'if',
  'in',
  'for',
  'let',
  'new',
  'try',
  'var',
  'case',
  'else',
  'enum',
  'eval',
  'false',
  'null',
  'this',
  'true',
  'void',
  'with',
  'break',
  'catch',
  'class',
  'const',
  'super',
  'throw',
  'while',
  'yield',
  'delete',
  'export',
  'import',
  'public',
  'return',
  'static',
  'switch',
  'typeof',
  'default',
  'extends',
  'finally',
  'package',
  'private',
  'continue',
  'debugger',
  'function',
  'arguments',
  'interface',
  'protected',
  'implements',
  'instanceof',
  // future reserved words
  'abstract',
  'boolean',
  'byte',
  'char',
  'double',
  'final',
  'float',
  'goto',
  'int',
  'long',
  'native',
  'short',
  'synchronized',
  'throws',
  'transient',
  'volatile',
  // special
  'as',
  'async',
  'from',
  'get',
  'of',
  'set',
]);
