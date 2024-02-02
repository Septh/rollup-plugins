import path from 'node:path'
import util from 'node:util'
import semver from 'semver'
import { execa } from 'execa'
import prependFile from 'prepend-file'
import { type Options } from './options.ts'
import * as colors from './util/color.ts'
import { getPackageInfo } from './package.ts'
import { getRepositoryInfo, VersionBump } from './repository.ts'
import { getRegistryInfo } from './registry.ts'
import { generateChangelogEntry } from './changelog.ts'
import { Failure, errorToString } from './util/error.ts'
import {
    PLUGINS_DIRECTORY, PLUGIN_NAME_PREFIX,
    PACKAGE_FILE, PACKAGE_LOCK_FILE, CHANGELOG_FILE,
    GIT_COMMIT_FORMAT, GIT_TAG_FORMAT, TEST_APPS_DIRECTORY,
} from './util/consts.ts'
import { findUp } from './util/file.ts'
import { enumerateArray } from './util/array.ts'

const logInfo1   = (...texts: string[]) => console.log(colors.cyan(...texts))
const logInfo2   = (...texts: string[]) => console.log(colors.blue(...texts))
const logWarning = (...texts: string[]) => console.warn(colors.yellow(...texts))
const logError   = (...texts: string[]) => (process.exitCode = 1, console.error(colors.red(...texts)))

const releaseTypes: semver.ReleaseType[] = [
    'major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'
]

export async function main(argv: Options): Promise<Failure | void> {

    // Allow running for any sub-directory inside the plugin's directory.
    let pluginPath = await findUp(directory => directory.hasFile(PACKAGE_FILE))
    if (!pluginPath)
        return logError(`Couldn't find a ${PACKAGE_FILE} file!`)

    // Also allow running from the sister directory in TEST_APPS_DIRECTORY.
    const parentDirectory = path.basename(path.dirname(pluginPath))
    if (parentDirectory === TEST_APPS_DIRECTORY)
        pluginPath = pluginPath.replace(TEST_APPS_DIRECTORY + path.sep, PLUGINS_DIRECTORY + path.sep)
    else if (parentDirectory !== PLUGINS_DIRECTORY) {
        return logError(
            'You must run this script from within a plugin package directory,',
            'i.e., one inside the', colors.bold(PLUGINS_DIRECTORY), 'directory.'
        )
    }

    if (pluginPath !== process.cwd()) {
        try {
            process.chdir(pluginPath)
        }
        catch(e) {
            return logError((e as NodeJS.ErrnoException).message)
        }
    }

    const pkgShortName = path.basename(pluginPath)
    const pkgLongName = PLUGIN_NAME_PREFIX + pkgShortName

    // Get package info.
    logInfo2(`Reading ${path.join(pluginPath, PACKAGE_FILE)}...`)
    const packageInfo = await getPackageInfo()

    if (packageInfo instanceof Failure)
        return logError(packageInfo.message)

    if (packageInfo.package.private)
        return logError('Cannot publish a private package.')

    if (packageInfo.package.name !== pkgLongName)
        return logError(`Name mismatch in ${PACKAGE_FILE}, expected ${JSON.stringify(pkgLongName)}, found ${JSON.stringify(packageInfo.package.name)}.`)

    if (!semver.valid(packageInfo.package.version))
        return logError(`Invalid version in ${PACKAGE_FILE}: ${JSON.stringify(packageInfo.package.version)}.`)

    // Get registry and repository info.
    logInfo2('Gathering infos from npm and git...')
    const [ registryInfo, repositoryInfo ] = await Promise.all([
        getRegistryInfo(packageInfo, argv.registry),
        getRepositoryInfo(packageInfo)
    ])

    if (registryInfo instanceof Failure)
        return logError('Error while querying/parsing npm info:', registryInfo.message)

    if (repositoryInfo instanceof Failure)
        return logError('Error while querying/parsing git info:', repositoryInfo.message)

    if (repositoryInfo.activeBranch !== packageInfo.shortName && !argv.debug)
        return logError('Please re-run this script while on the', colors.bold(packageInfo.shortName), 'branch.')

    if (repositoryInfo.dirtyPackages.size > 0) {
        const dirty = Array.from(repositoryInfo.dirtyPackages).map(p => colors.bold(p))
        return logError(
            'Cannot create a commit for a plugin while files from other plugins are modified or even staged.',
            'Please commit changes on', enumerateArray(dirty), 'before running this script again.'
        )
    }

    // Display info.
    logInfo1('Releasing', colors.bold(pkgLongName), 'package from', colors.bold(`/${PLUGINS_DIRECTORY}/${pkgShortName} directory.`))
    if (argv.preview)
        logWarning('*** DRY RUN MODE: no files will be modified.')
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
        return logError('Current version is lower than the latest tag version in repository!')

    if (registryInfo.latestVersion && semver.lt(packageInfo.package.version, registryInfo.latestVersion))
        return logError('Current version is lower than the latest version in registry!')

    if (repositoryInfo.commits.length === 0)
        return logWarning('No new commits found since last tag: nothing to do.')

    if (repositoryInfo.suggestedBump === VersionBump.none) {
        return logWarning('Detected no breaking change, no new feature and no bug fix: no need to release.')
    }

    // Guess next version number.
    const currentPrereleaseData = semver.prerelease(packageInfo.package.version)
    const currentPrereleaseId = typeof currentPrereleaseData?.[0] === 'string'
        ? currentPrereleaseData[0]
        : undefined

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
                : repositoryInfo.suggestedBump === VersionBump.patch
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
                : (askedPrereleaseId ? 'pre' : '') + VersionBump[repositoryInfo.suggestedBump] as semver.ReleaseType
        )
    }

    const nextVersion = semver.inc(packageInfo.package.version, askedReleaseType, askedPrereleaseId ?? currentPrereleaseId)
    if (nextVersion === null)
        return logError('Unexpected error while calculating next version number!')

    // All set... let's do it!
    logInfo1(`Next version is ${colors.bold(JSON.stringify(nextVersion))}.`)
    if (argv.preview) {
        logWarning('*** DRY RUN: stopping here, the new changelog entry would be:')
        delete packageInfo.urls // make it easier on the eye
        const changeLogEntry = generateChangelogEntry(repositoryInfo, packageInfo, nextVersion)
        return console.log(colors.magentaBright(changeLogEntry))
    }

    const changeLogEntry = generateChangelogEntry(repositoryInfo, packageInfo, nextVersion)
    try {
        logInfo2(`Updating ${CHANGELOG_FILE}...`)
        await prependFile(CHANGELOG_FILE, changeLogEntry)

        // Resort to npm for version bumping.
        logInfo2(`Updating ${PACKAGE_FILE} version using npm...`)
        await execa('npm', [
            '--no-git-tag-version',
            'version', nextVersion
        ])

        // Stage changed files, create commit and tag it.
        logInfo2("Staging changed files...")
        const { exitCode, stderr } = await execa('git', [ 'add',
            `:/${PACKAGE_LOCK_FILE}`,
            `:/${packageInfo.packageDir}/${PACKAGE_FILE}`,
            `:/${packageInfo.packageDir}/${CHANGELOG_FILE}`,
            ...repositoryInfo.filesToCommit
        ], { cwd: packageInfo.workspaceRoot })
        .then(() => {
            if (argv.commit) {
                logInfo2("Committing staged files...")
                return execa('git', [ 'commit',
                    '--message', util.format(GIT_COMMIT_FORMAT, packageInfo.package.name, nextVersion)
                ])
            }
            return { exitCode: 0, stderr: '' }
        })
        .then(() => {
            if (argv.tag && argv.commit) {
                logInfo2("Tagging...")
                return execa('git', [ 'tag',
                    util.format(GIT_TAG_FORMAT, packageInfo.package.name, nextVersion),
                    'HEAD'
                ])
            }
            return { exitCode: 0, stderr: ''}
        })

        if (exitCode !== 0)
            throw new Error(stderr || 'Error while running git.')

        logInfo1(`All done. Use "${colors.bold('npm publish')}" to publish package to registry.`)
        logInfo1(
            "You should also merge this branch into the main branch",
            `then use "${colors.bold('git push --follow-tags')}" to update Github.`
        )
    }
    catch(e) {
        logError(errorToString(e, { 'ENOENT': 'command not found.'}))
    }
}
