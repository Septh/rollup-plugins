import fs from 'node:fs/promises'
import path from 'node:path'
import { findUp } from './util/file.js'
import { PACKAGE_FILE } from './util/consts.js'
import { Failure } from './util/error.js'

export interface PackageInfo {
    workspaceRoot: string
    packageDir: string
    shortName: string
    urls?: {
        repository: URL
        directory?: URL
    }
    package: PackageJson
}

// Standard package.json fields
interface PackageJson {
    private?: boolean
    name: string
    version: string
    repository?: string | {
        url: string
        type?: string
        directory?: string
    }
    bugs?: string | {
        url?: string
        email?: string
    },
    workspaces?: string[]
}

function sanitizeUrl(url: string) {
    return url.replace(/^git+/, '').replace(/\.git$/, '')
}

type JsonObject = Record<string, any>
async function readJson<T extends JsonObject = JsonObject>(filePath: string): Promise<T | Failure> {
    try {
        const raw = await fs.readFile(filePath)
        return JSON.parse(raw.toString())
    }
    catch(e) {
        return new Failure(e instanceof SyntaxError
            ? `Error parsing ${path.resolve(PACKAGE_FILE)}.`
            : (e as NodeJS.ErrnoException).code === 'ENOENT'
                ? `No ${PACKAGE_FILE} file found in current directory.`
                : `Error reading ${path.resolve(PACKAGE_FILE)}.`
        )
    }
}

export async function getPackageInfo(): Promise<PackageInfo | Failure> {

    // Read ./package.json
    const pkg = await readJson<PackageJson>(PACKAGE_FILE)
    if (pkg instanceof Failure)
        return pkg

    // Find workspace root
    const packageRoot = process.cwd()
    const workspaceRoot = await findUp(async directory => {
        if (directory.hasFile(PACKAGE_FILE)) {
            const result = await readJson<PackageJson>(path.join(directory.path, PACKAGE_FILE))
            if ('workspaces' in result && Array.isArray(result.workspaces))
                return true
        }
        return false
    }, { cwd: packageRoot, skipCwd: true }) ?? packageRoot

    // Resolve package urls
    // TODO: handle all possible cases described at https://docs.npmjs.com/cli/v9/configuring-npm/package-json#repository
    let urls: PackageInfo['urls']
    if (pkg.repository) {
        let repositoryUrl: URL
        let directoryUrl: URL | undefined
        if (typeof pkg.repository === 'string')
            repositoryUrl = new URL(sanitizeUrl(pkg.repository))
        else {
            const { url, directory } = pkg.repository
            repositoryUrl = new URL(sanitizeUrl(url))
            if (directory) {
                directoryUrl = new URL(
                    repositoryUrl.href + '/' + directory.replace(/^\/+/, '')
                )
            }
        }

        urls = {
            repository: repositoryUrl,
            directory: directoryUrl
        }
    }

    return {
        workspaceRoot,
        packageDir: path.relative(workspaceRoot, packageRoot).replace(/\\/g, '/'),
        shortName: path.basename(packageRoot),
        urls,
        package: pkg
    }
}
