import util from 'node:util'
import { execa } from 'execa'
import ccParser from 'conventional-commits-parser'
import type { PackageInfo } from './package.js'
import { errorToString, Failure } from './error.js'
import { GIT_TAG_FORMAT, PLUGINS_DIRECTORY, SCRIPTS_DIRECTORY, TEST_APPS_DIRECTORY } from './consts.js'

export type Commit = ccParser.Commit & {
    breaking?: boolean
}

export enum VersionBump {
    patch,
    minor,
    major
}

export interface RepositoryInfo {
    activeBranch: string
    filesToCommit: Set<string>
    filesToIgnore: Set<string>
    dirtyPackages: Set<string>
    commits: Commit[]
    previousTag?: string
    previousTagVersion?: string
    suggestedBump: VersionBump
}

export async function getRepositoryInfo(packageInfo: PackageInfo): Promise<RepositoryInfo | Failure> {

    let info: RepositoryInfo = {
        activeBranch: 'none',
        /** Files inside the current package. */
        filesToCommit: new Set(),
        /** Files inside other package. */
        dirtyPackages: new Set(),
        /** Files outside any package. */
        filesToIgnore: new Set(),
        commits: [],
        suggestedBump: VersionBump.patch,
    }

    const results = await Promise.allSettled([
        // Get the current branch.
        execa('git', [ 'branch', '--show-current' ]).then(({ stdout }) => {
            info.activeBranch = stdout
        }),

        // Get the list of files to commit.
        execa('git', [ 'status', '--porcelain' ]).then(({ stdout }) => {
            stdout.split('\n').forEach(change => {
                // const staged = change.charAt(0) !== ' '
                // const modified = change.charAt(1) !== ' '
                const file = change.slice(3),
                      split = file.split('/'),
                      [ dir, subDir ] = split
                if (dir === PLUGINS_DIRECTORY || dir === TEST_APPS_DIRECTORY) {
                    subDir === packageInfo.shortName
                        ? info.filesToCommit.add(file)
                        : info.dirtyPackages.add(`${dir}/${subDir}`)
                }
                else if (dir === SCRIPTS_DIRECTORY)
                    info.filesToIgnore.add(`${dir}/${subDir}`)
                else info.filesToCommit.add(file)
            })
        }),

        // Get the latest tag for this plugin.
        execa('git', [ 'tag',
            '--list', util.format(GIT_TAG_FORMAT, packageInfo.package.name, '*'),
            '--sort', 'version:refname',
        ]).then(({ stdout }) => {
            if (stdout.length) {
                info.previousTag = stdout.split('\n').pop()!
                info.previousTagVersion = /v(\d+\.\d+\.\d+)/.exec(info.previousTag)?.[1]
            }
        })
    ])

    for (const result of results) {
        if (result.status === 'rejected')
            return new Failure(errorToString(result.reason, { 'ENOENT': 'git not found' }))
    }

    try {
        // Get all commits since latest tag.
        const SEPARATOR = '----- 😎 -----'
        const { stdout } = await execa('git', [ '--no-pager', 'log',
            [ info.previousTag, 'HEAD' ].filter(Boolean).join('..'),
            '--format=%B%n-hash-%n%H%n' + SEPARATOR
        ])

        // Filter commits based on scope and guess bump type.
        stdout.split(SEPARATOR + '\n').forEach(rawCommit => {
            rawCommit = rawCommit.trim()
            if (rawCommit.length > 0) {
                const commit = ccParser.sync(rawCommit) as Commit
                if (commit.type && (commit.scope === packageInfo.shortName || commit.scope === packageInfo.package.name) && !commit.revert) {
                    commit.breaking = commit.notes.some(({ title }) => /^BREAKING CHANGE:/i.test(title))
                    if (commit.breaking)
                        info.suggestedBump = VersionBump.major
                    else if (commit.type === 'feat' && info.suggestedBump !== VersionBump.major)
                        info.suggestedBump = VersionBump.minor

                    info.commits.push(commit)
                }
            }
        })

        return info
    }
    catch(e) {
        return new Failure(errorToString(e, { 'ENOENT': 'git not found' }))
    }
}
