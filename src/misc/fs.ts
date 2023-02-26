
export type FileSystem = {
    readFile: (path: string) => Promise<string>;
};

export async function createFileSystem(): Promise<FileSystem> {
    if (global?.process?.versions?.node != null) {
        return import('fs/promises').then(({ readFile }) => ({
            readFile: (path: string) => readFile(path, 'utf8'),
        }));
    } else {
        return {
            readFile: () => Promise.reject('Not implemented'),
        };
    }
}
