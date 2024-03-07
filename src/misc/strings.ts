import { panic } from './utils';

export function isUpperCase(str: string): boolean {
  return str.toUpperCase() === str;
}

export function isLowerCase(str: string): boolean {
  return str.toLowerCase() === str;
}

export function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
}

export const Backtick = {
  encode(input: string): string {
    const firstChar = input.charAt(0);
    const restOfString = input.slice(1);

    const isValidFirstChar = (char: string): boolean => {
      return /[a-zA-Z_$]/.test(char);
    };

    const isValidChar = (char: string): boolean => {
      return /[a-zA-Z0-9_$]/.test(char);
    };

    const escapeChar = (char: string): string => {
      return `_${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    };

    const sanitizedFirstChar = isValidFirstChar(firstChar) ? firstChar : escapeChar(firstChar);
    const sanitizedRestOfString = restOfString
      .split('')
      .map(char => (isValidChar(char) ? char : escapeChar(char)))
      .join('');

    return sanitizedFirstChar + sanitizedRestOfString;
  },
  decode(ident: string): string {
    const regex = /_[0-9a-fA-F]{4}/g;

    return ident.replace(regex, match => {
      const codePoint = parseInt(match.slice(1), 16);
      return String.fromCharCode(codePoint);
    });
  },
};

export function matchString<T extends string, R>(
  str: T,
  cases: Record<T, R | (() => R)> | (Partial<Record<T, R | (() => R)>> & { _: R | (() => R) }),
): R {
  if (str in cases) {
    const result = cases[str];
    return typeof result === 'function' ? result() : result;
  }

  if ('_' in cases) {
    const result = cases._;
    return typeof result === 'function' ? (result as () => R)() : result;
  }

  return panic(`missing case for ${str}`);
}

export function countCharacterOccurrences(
  str: string,
  char: string,
  endIndex = str.length,
): number {
  let count = 0;

  for (let i = 0; i < endIndex; i++) {
    if (str[i] === char) {
      count += 1;
    }
  }

  return count;
}
