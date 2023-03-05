import { panic } from './utils';

export type FileSystem = {
    readFile: (path: string) => Promise<string>;
    absolutePath: (relativePath: string) => string;
    directoryName: (path: string) => string;
    join: (...paths: string[]) => string;
};

export async function createFileSystem(): Promise<FileSystem> {
    if (global?.process?.versions?.node != null) {
        const { readFile } = await import('fs/promises');
        const { resolve, dirname, join } = await import('path');

        return {
            readFile: path => readFile(path, 'utf8'),
            absolutePath: relativePath => resolve(relativePath),
            directoryName: path => dirname(path),
            join: (...paths) => join(...paths),
        };
    } else {
        return {
            readFile: () => Promise.reject('Not implemented'),
            absolutePath: () => panic('Not implemented'),
            directoryName: () => panic('Not implemented'),
            join: () => panic('Not implemented'),
        };
    }
}
