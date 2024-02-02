import util from 'node:util'
import { execa } from 'execa'
import ccParser from 'conventional-commits-parser'
import type { PackageInfo } from './package.ts'
import { errorToString, Failure } from './util/error.ts'
import { GIT_TAG_FORMAT, PLUGINS_DIRECTORY, SCRIPTS_DIRECTORY, TEST_APPS_DIRECTORY } from './util/consts.ts'

export type Commit = ccParser.Commit & {
    breaking?: boolean
}

export enum VersionBump {
    none,
    patch,
    minor,
    major
}

export interface RepositoryInfo {
    activeBranch: string
    /** Files inside the current package. */
    filesToCommit: Set<string>
    /** Files inside other packages. */
    dirtyPackages: Set<string>
    /** Files outside any package. */
    filesToIgnore: Set<string>
    /** List of commits scoped to the package. */
    commits: Commit[]
    suggestedBump: VersionBump
    previousTag?: string
    previousTagVersion?: string
}

const COMMITS_SEPARATOR = '----- 😎 -----'

export async function getRepositoryInfo(packageInfo: PackageInfo): Promise<RepositoryInfo | Failure> {

    const info: RepositoryInfo = {
        activeBranch: 'none',
        filesToCommit: new Set(),
        dirtyPackages: new Set(),
        filesToIgnore: new Set(),
        suggestedBump: VersionBump.none,
        commits: [],
    }

    try {
        await Promise.all([

            // Get the active branch.
            execa('git', [ 'branch', '--show-current' ]).then(({ stdout }) => {
                if (stdout.startsWith('fatal: '))
                    throw new Error(stdout.slice(7))

                if (stdout.length)
                    info.activeBranch = stdout
            }),

            // Get the list of files to commit.
            execa('git', [ 'status', '--porcelain' ]).then(({ stdout }) => {
                if (stdout.length > 0) {
                    stdout.split('\n').forEach(change => {
                        // const isStaged = change.charAt(0) !== ' '
                        // const isModified = change.charAt(1) !== ' '
                        const file = change.slice(3),
                              [ dir, subDir ] = file.split('/')
                        if (dir === PLUGINS_DIRECTORY || dir === TEST_APPS_DIRECTORY) {
                            subDir === packageInfo.shortName
                                ? info.filesToCommit.add(file)
                                : info.dirtyPackages.add(`${dir}/${subDir}`)
                        }
                        else if (dir === SCRIPTS_DIRECTORY)
                            info.filesToIgnore.add(file)
                        else
                            info.filesToCommit.add(file)
                    })
                }
            }),

            // Get the latest tag for this plugin, then all commits since this tag,
            // then flter these commits based on scope and guess bump type.
            execa('git', [ 'tag',
                '--list', util.format(GIT_TAG_FORMAT, packageInfo.package.name, '*'),
                '--sort', 'version:refname',
            ])
            .then(({ stdout }) => {
                let range = 'HEAD'
                if (stdout.length) {
                    info.previousTag = stdout.split('\n').pop()!
                    info.previousTagVersion = /^v(\d+\.\d+\.\d+)/.exec(info.previousTag)?.[1]

                    range = info.previousTag + '..HEAD'
                }

                return execa('git', [ '--no-pager', 'log',
                    range,
                    '--format=%B%n-hash-%n%H%n' + COMMITS_SEPARATOR
                ])
            })
            .then(({ stdout }) => {
                stdout.split(COMMITS_SEPARATOR + '\n').forEach(rawCommit => {
                    rawCommit = rawCommit.trim()
                    if (rawCommit.length > 0) {
                        const commit = ccParser.sync(rawCommit) as Commit
                        if (commit.type && (commit.scope === packageInfo.shortName || commit.scope === packageInfo.package.name) && !commit.revert) {
                            commit.breaking = commit.notes.some(({ title }) => /^BREAKING CHANGE:/i.test(title))
                            if (commit.breaking)
                                info.suggestedBump = VersionBump.major
                            else if (commit.type === 'feat' && info.suggestedBump < VersionBump.major)
                                info.suggestedBump = VersionBump.minor
                            else if (commit.type === 'fix' && info.suggestedBump < VersionBump.minor)
                                info.suggestedBump = VersionBump.patch

                            info.commits.push(commit)
                        }
                    }
                })
            })
        ])

        return info
    }
    catch(e) {
        return new Failure(errorToString(e, { 'ENOENT': 'git not found' }))
    }
}
