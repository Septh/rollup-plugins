import yargs from 'yargs-parser'
import type semver from 'semver'

export type Argv = Partial<Record<semver.ReleaseType, boolean> & {
    version: boolean
    help: boolean
    dryRun: boolean
    preid: string
    registry: string
    tag: boolean
    commit: boolean
    debug: boolean
}>

export const argv = yargs(process.argv.slice(2), {
    alias: {
        version: [ 'v' ],
        help: [ 'h' ],
        dryRun: [ 'dry', 'preview', 'p' ],
        preid: [ 'preId', 'pre' ]
    },
    default: {
        tag: true,
        commit: true
    }
}) as Argv
