import { execa } from 'execa'
import { Failure } from './util/error.js'
import type { PackageInfo } from './package.js'

export interface RegistryInfo {
    versions: string[]
    latestVersion?: string
}

export async function getRegistryInfo(packageInfo: PackageInfo, registry?: string): Promise<RegistryInfo | Failure> {
    try {
        const { stdout } = await execa('npm', [
            'view', packageInfo.package.name, 'versions',
            typeof registry === 'string' ? `--registry=${registry}` : '',
            '--workspaces=false',       // <-- Disables 'Ignoring workspaces for specified package(s)' warning
            '--json'
        ].filter(Boolean))
        const versions: string[] = JSON.parse(stdout)
        return {
            versions,
            latestVersion: versions.at(-1)
        }
    }
    catch(e) {
        let error: string
        if (e instanceof SyntaxError)
            error = e.toString()
        else {
            const { code, message } = e as NodeJS.ErrnoException
            if (code === 'E404' || message.includes('E404')) {
                // package doest not exist in the registry, this is not an error
                return {
                    versions: []
                }
            }
            else if (code === 'ENOENT' || message.includes('ENOENT'))
                error = 'Could not run npm.'
            else error = message
        }
        return new Failure(error)
    }
}
