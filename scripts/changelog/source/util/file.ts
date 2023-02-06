import { readdirSync, type Dirent } from 'node:fs'
import path from 'node:path'
import { isPromise } from 'node:util/types'

export interface FindUpOptions {
    cwd?: string
    skipCwd?: boolean
}

export class Directory {
    public readonly path: string
    constructor(path: string) {
        this.path = path
    }

    get parent(): Directory | undefined {
        const parentDir = path.dirname(this.path)
        return parentDir !== this.path
            ? new Directory(parentDir)
            : undefined
    }

    #_entries: Dirent[] | undefined
    get #entries() {
        return this.#_entries ?? (this.#_entries = readdirSync(this.path, { withFileTypes: true }))
    }

    hasEntry(name: string) {
        return this.#entries.some(entry => entry.name === name)
    }

    hasFile(name: string) {
        return this.#entries.some(entry => entry.isFile() && entry.name === name)
    }

    hasDirectory(name: string) {
        return this.#entries.some(entry => entry.isDirectory() && entry.name === name)
    }
}

export async function findUp(predicate: (directory: Directory) => boolean | Promise<boolean>, options: FindUpOptions = {}): Promise<string | undefined> {
    function up(dir: string) {
        const parentDir = path.dirname(dir)
        return parentDir === dir ? undefined : parentDir
    }

    let { cwd = process.cwd() as string | undefined } = options
    if (options.skipCwd)
        cwd = up(cwd!)

    while (cwd) {
        const stop = predicate(new Directory(cwd))
        if (isPromise(stop) ? await stop : stop)
            break
        cwd = up(cwd)
    }

    return cwd
}
