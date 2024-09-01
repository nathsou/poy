import { existsSync } from 'fs';
import { panic } from './utils';

export type FileSystem = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  absolutePath: (relativePath: string) => string;
  directoryName: (path: string) => string;
  join: (...paths: string[]) => string;
  normalize: (path: string) => string;
  resolveStd: () => Promise<string>;
};

export async function createFileSystem(): Promise<FileSystem> {
  if (global?.process?.versions?.node != null) {
    const { lstatSync } = await import('fs');
    const { readFile, writeFile } = await import('fs/promises');
    const { resolve, dirname, join, sep } = await import('path');
    let stdPath: string | null = null;

    return {
      readFile: path => readFile(path, 'utf8'),
      writeFile: (path, content) => writeFile(path, content, 'utf8'),
      absolutePath: relativePath => resolve(relativePath),
      directoryName: path => dirname(path),
      join: (...paths) => join(...paths),
      normalize: path => {
        if (lstatSync(path).isDirectory()) {
          panic('Cannot link a directory: ' + path);
        }
        return path.split(sep).join('/');
      },
      resolveStd: async () => {
        if (stdPath != null) {
          return stdPath;
        }

        const path = [__dirname];

        for (let i = 0; i < 5; i += 1) {
          if (existsSync(join(...path, 'poy'))) {
            const res = resolve(join(...path, 'poy', 'std'));
            stdPath = res;
            return res;
          } else {
            path.push('..');
          }
        }

        return panic('std not found');
      },
    };
  } else {
    return {
      readFile: () => Promise.reject('Not implemented'),
      writeFile: () => Promise.reject('Not implemented'),
      absolutePath: () => panic('Not implemented'),
      directoryName: () => panic('Not implemented'),
      join: () => panic('Not implemented'),
      normalize: () => panic('Not implemented'),
      resolveStd: () => Promise.reject('Not implemented'),
    };
  }
}
