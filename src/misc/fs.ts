import { panic } from './utils';

export type FileSystem = {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    absolutePath: (relativePath: string) => string;
    directoryName: (path: string) => string;
    join: (...paths: string[]) => string;
};

export async function createFileSystem(): Promise<FileSystem> {
    if (global?.process?.versions?.node != null) {
        const { readFile, writeFile } = await import('fs/promises');
        const { resolve, dirname, join } = await import('path');

        return {
            readFile: path => readFile(path, 'utf8'),
            writeFile: (path, content) => writeFile(path, content, 'utf8'),
            absolutePath: relativePath => resolve(relativePath),
            directoryName: path => dirname(path),
            join: (...paths) => join(...paths),
        };
    } else {
        return {
            readFile: () => Promise.reject('Not implemented'),
            writeFile: () => Promise.reject('Not implemented'),
            absolutePath: () => panic('Not implemented'),
            directoryName: () => panic('Not implemented'),
            join: () => panic('Not implemented'),
        };
    }
}
