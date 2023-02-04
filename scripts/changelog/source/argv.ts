import yargs from 'yargs-parser'
import type semver from 'semver'

export type Argv = Partial<Record<semver.ReleaseType, boolean> & {
    help: boolean
    dryRun: boolean
    preid: string
    registry: string
    debug: boolean
}>

export const argv = yargs(process.argv.slice(2), {
    alias: {
        help: [ 'h' ],
        dryRun: [ 'dry', 'preview', 'p' ],
        preid: [ 'preId', 'pre' ]
    }
}) as Argv
