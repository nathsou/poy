
export function isUpperCase(str: string): boolean {
    return str.toUpperCase() === str;
}

export function isLowerCase(str: string): boolean {
    return str.toLowerCase() === str;
}

export function camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}
