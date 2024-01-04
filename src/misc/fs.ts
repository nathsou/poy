import { panic } from './utils.js'

export type FileSystem = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  absolutePath: (relativePath: string) => string
  directoryName: (path: string) => string
  join: (...paths: string[]) => string
  normalize: (path: string) => string
}

export async function createFileSystem(): Promise<FileSystem> {
  if (global?.process?.versions?.node != null) {
    const { lstatSync } = await import('fs')
    const { readFile, writeFile } = await import('fs/promises')
    const { resolve, dirname, join, sep } = await import('path')

    return {
      readFile: path => readFile(path, 'utf8'),
      writeFile: (path, content) => writeFile(path, content, 'utf8'),
      absolutePath: relativePath => resolve(relativePath),
      directoryName: path => dirname(path),
      join: (...paths) => join(...paths),
      normalize: (path) => {
        if (lstatSync(path).isDirectory()) {
          panic('Cannot link a directory: ' + path)
        }
        return path.split(sep).join('/')
      },
    }
  } else {
    return {
      readFile: () => Promise.reject('Not implemented'),
      writeFile: () => Promise.reject('Not implemented'),
      absolutePath: () => panic('Not implemented'),
      directoryName: () => panic('Not implemented'),
      join: () => panic('Not implemented'),
      normalize: () => panic('Not implemented'),
    }
  }
}
