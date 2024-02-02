import { EOL } from 'node:os'
import yargs from 'yargs-parser'
import type { CamelCase } from 'type-fest'
import { self } from './util/self.ts'
import { Failure } from './util/error.ts'
import { enumerateArray } from './util/array.ts'

export const helpText = [
    `Usage: ${self.name} [all | <package> [<package> [...]]] [options]`,
    `where options can be:`,
    `  --version | -v         Print ${self.name} version and exit immediately`,
    `  --help | -h            Print this help message and exit immediately`,
    `  --preview | --dry-run  Don't modify any files, don't push tags and don't publish any package`,
    `  --major                Force bump version number(s) to next major`,
    `  --minor                Force bump version number(s) to next minor`,
    `  --patch                Force bump version number(s) to next patch`,
    `  --pre[=<suffix>]       Bump version number(s) with a pre-version suffix`,
    `  --no-changelog | -C    Do not generate or update changelog(s)`,
    `  --no-tag | -T          Do not tag package(s) and do not push to remote(s)`,
    `  --no-git               Disable all git-related operations`,
    // `Refer to ${self.homepage} for more detail.`
].join(EOL)

interface RawArgs {
    ['version']?:      boolean
    ['help']?:         boolean
    ['preview']?:      boolean
    ['major']?:        boolean
    ['minor']?:        boolean
    ['patch']?:        boolean
    ['pre']?:          boolean | string
    ['no-changelog']?: boolean
    ['no-tag']?:       boolean
    ['no-git']?:       boolean
}

export type Options = {
    packages?: 'all' | string[]

    // TODO: virer tout ça
    preid?: string
    registry?: string
    tag?: boolean
    commit?: boolean
    debug?: boolean
} & {
    // https://github.com/sindresorhus/type-fest/blob/eccf1713046908b0311be9709a9af7ecceabbdd9/source/camel-case.d.ts#L50
    [K in keyof RawArgs as CamelCase<K>]: RawArgs[K]
} & {
    [ other: string ]: any
}

const mutuallyExclusiveFlags: Array<keyof RawArgs> = [
    'major', 'minor', 'patch'
]

const validSuffixes = [
    'alpha', 'beta', 'rc'
]

export function getOptions(): Failure | Options {
    const { argv, error } = yargs.detailed(process.argv.slice(2), {
        boolean: [
            'version', 'help', 'preview', 'no-changelog', 'no-tag', 'no-git', ...mutuallyExclusiveFlags,
        ],
        alias: {
            version:     [ 'v' ],
            help:        [ 'h' ],
            preview:     [ 'dry-run' ],
            noChangelog: [ 'C' ],
            noTag:       [ 'T' ]
        },
        configuration: {
            "parse-numbers": false,
            "boolean-negation": false,
            "strip-aliased": true,
            "strip-dashed": true
        }
    })

    if (error instanceof Error)
        return new Failure(error.message)

    // Check package names
    let packages: Options['packages'] = undefined
    if (argv._.length === 1) {
        let [ pkg ] = argv._ as string[]
        packages = pkg === 'all' || pkg === '*' ? 'all' : [ pkg ]
    }
    else if (argv._.length) {
        packages = argv._ as string[]
        if (packages.some(pkg => pkg === 'all' || pkg === '*'))
            return new Failure("Cannot specify 'all' when multiple package names are given.")
    }

    // version-related flags are mutually exclusive
    for (let i = 0; i < mutuallyExclusiveFlags.length - 1; i++) {
        const first = mutuallyExclusiveFlags[i]
        if (first in argv && argv[first]) {
            for (let j = i + 1; j < mutuallyExclusiveFlags.length; j++) {
                const second = mutuallyExclusiveFlags[j]
                if (second in argv && argv[second]) {
                    return new Failure("'$1' and '$2' arguments are mutually exclusive, please specify one or the other but not both.", `--${first}`, `--${second}`)
                }
            }
        }
    }

    // Check suffix if given to pre option
    const { pre } = argv as Options
    if (typeof pre === 'string' && !validSuffixes.includes(pre)) {
        return new Failure(
            "Invalid value $1 for 'pre' option, must be either unspecified or one of $2",
            JSON.stringify(pre), enumerateArray(validSuffixes, undefined, ' or ')
        )
    }

    return {
        packages,
        ...argv
    }
}
