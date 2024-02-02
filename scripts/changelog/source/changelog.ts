import { EOL } from 'node:os'
import type { PackageInfo } from './package.ts'
import type { RepositoryInfo } from './repository.ts'

export function generateChangelogEntry(repositoryInfo: RepositoryInfo, packageInfo: PackageInfo, nextVersion: string) {

    const logEntry = {
        breaking: [] as string[],
        features: [] as string[],
        fixes: [] as string[],
        notes: [] as string[]
    }

    repositoryInfo.commits.forEach(commit => {
        const { subject, hash, references, mentions } = commit

        let message = '- ' + (subject ?? '')
        if (packageInfo.urls) {
            for (const reference of references) {
                const rx = new RegExp(`(#${reference.issue})`, 'g')
                message = message.replace(rx, `[$1](${packageInfo.urls.repository.href}/issues/${reference.issue})`)
            }

            for (const mention of mentions) {
                const rx = new RegExp(`(@${mention})`, 'g')
                message = message.replace(rx, `[$1](https://www.github.com/${mention})`)
            }
        }

        if (typeof hash === 'string') {
            message += packageInfo.urls
                ? ` ([${hash.slice(0, 7)}](${packageInfo.urls.repository.href}/commits/${hash}))`
                : ` (${hash.slice(0, 7)})`
        }

        if (commit.breaking)
            logEntry.breaking.push(message)
        else if (commit.type === 'feat')
            logEntry.features.push(message)
        else if (commit.type === 'fix')
            logEntry.fixes.push(message)
        else
            logEntry.notes.push(message)
    })

    const lines: (string | (string | string[])[] | false)[] = [
        // Title
        `## ${packageInfo.package.name} v${nextVersion}`,
        `_${new Date().toISOString().slice(0, 10)}_`,
        '',
        logEntry.breaking.length > 0 && [
            '### ⚠️ BREAKING CHANGES',
            logEntry.breaking,
            ''
        ],
        logEntry.features.length > 0 && [
            '### New Features',
            logEntry.features,
            ''
        ],
        logEntry.fixes.length > 0 && [
            '### Bug Fixes',
            logEntry.fixes,
            ''
        ],
        logEntry.notes.length > 0 && [
            '### Other',
            logEntry.notes,
            ''
        ]
    ]

    return lines
        .flat(Infinity)
        .filter(line => typeof line === 'string')
        .join(EOL)
        .trim()
}
