import path from 'node:path'
import util from 'node:util'
import semver from 'semver'
import { execa } from 'execa'
import prependFile from 'prepend-file'
import type { Argv } from './argv.js'
import * as colors from './include/color.js'
import { getPackageInfo } from './include/package.js'
import { getRepositoryInfo, VersionBump } from './include/repository.js'
import { getRegistryInfo } from './include/registry.js'
import { generateChangelogEntry } from './include/changelog.js'
import { Failure, errorToString } from './include/error.js'
import {
    PLUGINS_DIRECTORY, PLUGIN_NAME_PREFIX,
    PACKAGE_FILE, PACKAGE_LOCK_FILE, CHANGELOG_FILE,
    GIT_COMMIT_FORMAT, GIT_TAG_FORMAT,
} from './include/consts.js'
import { findUp } from './include/file.js'
import { enumerateArray } from './include/array.js'

const logInfo1   = (...texts: string[]) => console.log(colors.cyan(...texts))
const logInfo2   = (...texts: string[]) => console.log(colors.blue(...texts))
const logWarning = (...texts: string[]) => console.warn(colors.yellow(...texts))
const logError   = (...texts: string[]) => (process.exitCode = 1, console.error(colors.red(...texts)))

const releaseTypes: semver.ReleaseType[] = [
    'major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'
]

export async function run(argv: Argv) {

    const cwd = await findUp(directory => directory.hasFile(PACKAGE_FILE))
    if (!cwd)
        logError(`No ${PACKAGE_FILE}`)
    else if (path.basename(path.dirname(cwd)) !== PLUGINS_DIRECTORY) {
        logError(
            'You must run this script from within a plugin package directory,',
            'i.e. one inside the', colors.bold(PLUGINS_DIRECTORY), 'directory.'
        )
    }
    else
    {
        process.chdir(cwd)
        const pkgShortName = path.basename(cwd)
        const pkgLongName = PLUGIN_NAME_PREFIX + pkgShortName

        logInfo2(`Reading ${path.join(cwd, PACKAGE_FILE)}...`)
        const packageInfo = await getPackageInfo()
        if (packageInfo instanceof Failure)
            logError(packageInfo.message)
        else if (packageInfo.package.private)
            logError('Cannot publish a private package.')
        else if (packageInfo.package.name !== pkgLongName)
            logError(`Name mismatch in ${PACKAGE_FILE}, expected ${JSON.stringify(pkgLongName)}, found ${JSON.stringify(packageInfo.package.name)}.`)
        else if (!semver.valid(packageInfo.package.version))
            logError(`Invalid version in ${PACKAGE_FILE}: ${JSON.stringify(packageInfo.package.version)}.`)
        else {
            logInfo1('Releasing', colors.bold(pkgLongName), 'package from', colors.bold(`/plugins/${pkgShortName} directory.`))
            if (argv.dryRun)
                logWarning('*** DRY RUN MODE: changelog will NOT be modified.')

            logInfo2('Gathering infos from npm and git...')
            const [ registryInfo, repositoryInfo ] = await Promise.all([
                getRegistryInfo(packageInfo, argv.registry),
                getRepositoryInfo(packageInfo)
            ])

            if (registryInfo instanceof Failure)
                logError('Error while querying/parsing npm info:', registryInfo.message)
            else if (repositoryInfo instanceof Failure)
                logError('Error while querying/parsing git info:', repositoryInfo.message)
            else if (repositoryInfo.activeBranch !== packageInfo.shortName && !argv.debug) {
                logWarning(
                    'Please re-run this script while on the', colors.bold(packageInfo.shortName), 'branch',
                    'if you want to generate the changelog.'
                )
            }
            else if (repositoryInfo.dirtyPackages.size > 0 && !argv.debug) {
                const dirty = Array.from(repositoryInfo.dirtyPackages).map(p => colors.bold(p))
                logWarning(
                    'Cannot create a commit for a plugin while files from other plugins are modified or even staged.',
                    'Please commit changes on', enumerateArray(dirty), 'before running this script again.'
                )
            }
            else {
                logInfo2(
                    `Current version in ${PACKAGE_FILE} is ${colors.bold(packageInfo.package.version)},`,
                    registryInfo.latestVersion
                        ? `latest version in registry is ${colors.bold(registryInfo.latestVersion)}.`
                        : 'package is not published in the registry,',
                    repositoryInfo.previousTag
                        ? `latest tag in repository is ${colors.bold(repositoryInfo.previousTag)},`
                        : 'repository has no tag for this package.'
                )

                if (repositoryInfo.previousTagVersion && semver.lt(packageInfo.package.version, repositoryInfo.previousTagVersion))
                    logError('Current version is lower than the latest tag version in repository!')
                else if (registryInfo.latestVersion && semver.lt(packageInfo.package.version, registryInfo.latestVersion))
                    logError('Current version is lower than the latest version in registry!')
                else if (repositoryInfo.previousTag && repositoryInfo.commits.length === 0)
                    logWarning('No new commits found since last tag, nothing to do.')
                else {
                    const currentPrereleaseData = semver.prerelease(packageInfo.package.version)
                    const currentPrereleaseId = typeof currentPrereleaseData?.[0] === 'string'
                        ? currentPrereleaseData[0]
                        : undefined
                    const { suggestedBump } = repositoryInfo

                    let askedReleaseType = releaseTypes.find((id): id is semver.ReleaseType => argv[id] as boolean)
                    let askedPrereleaseId = argv.preid

                    if (packageInfo.package.version === '0.0.0') {
                        // Not yet released. Unless asked otherwise, first release is either:
                        // - 0.1.0-<preid>.0 if a preid is given;
                        // - 1.0.0 otherwise.
                        askedReleaseType ??= askedPrereleaseId ? 'preminor' : 'major'
                    }
                    else if (packageInfo.package.version.startsWith('0.')) {
                        // Current version is a preliminary version. Unless asked otherwise, next version is either:
                        // - a prerelease bump if a preid is present;
                        // - a patch or minor bump, even if suggestedBump says there are breaking changes;
                        // - a prepatch or preminor bump, even if suggestedBump says there are breaking changes, if a preid is given.
                        askedReleaseType ??= (
                            currentPrereleaseData
                                ? 'prerelease'
                                : suggestedBump === VersionBump.patch
                                    ? askedPrereleaseId ? 'prepatch' : 'patch'
                                    : askedPrereleaseId ? 'preminor' : 'minor'
                        )
                    }
                    else {
                        // Current version is a regular version. Unless asked otherwise, next version is either:
                        // - prerelease bump if a preid is present or given;
                        // - a patch, minor or major bump, based on suggestedBump;
                        // - a prepatch, preminor or premajor bump, based on suggestedBump, if a preid is given.
                        askedReleaseType = (
                            currentPrereleaseData
                                ? 'prerelease'
                                : (askedPrereleaseId ? 'pre' : '') + VersionBump[suggestedBump] as semver.ReleaseType
                        )
                    }

                    const nextVersion = semver.inc(packageInfo.package.version, askedReleaseType, askedPrereleaseId ?? currentPrereleaseId)
                    if (nextVersion === null)
                        logError('Unexpected error while calculating the next version number!')
                    else {
                        logInfo1(`Next version is ${colors.bold(JSON.stringify(nextVersion))}.`)

                        if (argv.dryRun) {
                            logWarning('*** DRY RUN: stopping here, the new changeLogEntry would be:')
                            delete packageInfo.urls // make it easier on the eye
                            const changeLogEntry = generateChangelogEntry(repositoryInfo, packageInfo, nextVersion)
                            console.log(colors.magentaBright(changeLogEntry))
                        }
                        else {
                            // We're all set... let's do it!
                            const changeLogEntry = generateChangelogEntry(repositoryInfo, packageInfo, nextVersion)
                            try {
                                const _execa = argv.debug
                                    ? async (cmd: string, args: string[], options?: any) => {
                                        console.dir({ cmd, args })
                                        return { exitCode: 0, stderr: ''}
                                      }
                                    : execa
                                const _prependFile = argv.debug
                                    ? async (file: string, data: any) => {}
                                    : prependFile

                                logInfo2(`Updating ${CHANGELOG_FILE}...`)
                                await _prependFile(CHANGELOG_FILE, changeLogEntry)

                                // Resort to npm for version bumping.
                                logInfo2(`Updating ${PACKAGE_FILE} version using npm...`)
                                await _execa('npm', [
                                    '--no-git-tag-version',
                                    'version', nextVersion
                                ])

                                // Stage changed files, create commit and tag it.
                                logInfo2("Staging changed files...")
                                const { exitCode, stderr } = await _execa('git', [
                                    'add',
                                        PACKAGE_LOCK_FILE,
                                        path.posix.join(packageInfo.packageDir, PACKAGE_FILE),
                                        path.posix.join(packageInfo.packageDir, CHANGELOG_FILE),
                                        ...repositoryInfo.filesToCommit
                                ], { cwd: packageInfo.workspaceRoot })
                                .then(() => {
                                    logInfo2("Committing staged files...")
                                    return _execa('git', [
                                        'commit',
                                        '--message', util.format(GIT_COMMIT_FORMAT, packageInfo.package.name, nextVersion)
                                    ])
                                })
                                .then(() => {
                                    logInfo2("Tagging...")
                                    return _execa('git', [
                                        'tag', util.format(GIT_TAG_FORMAT, packageInfo.package.name, nextVersion), 'HEAD'
                                    ])
                                })

                                if (exitCode !== 0)
                                    throw new Error(stderr || 'Error while running git.')

                                logInfo1("All done. Use 'npm publish' to publish package to registry.")
                                logInfo1(
                                    "You should also probably merge this branch into the main branch",
                                    "then use 'git push --tags' to update Github."
                                )
                            }
                            catch(e) {
                                logError(errorToString(e, { 'ENOENT': 'command not found.'}))
                            }
                        }
                    }
                }
            }
        }
    }
}
