export const PLUGINS_DIRECTORY   = 'plugins'
export const TEST_APPS_DIRECTORY = 'test-apps'
export const SCRIPTS_DIRECTORY   = 'scripts'

export const PLUGIN_NAME_RX      = /^plugins\/([^/]+)(?:\/(.*))?$/
export const PLUGIN_NAME_PREFIX  = 'rollup-plugin-'

export const PACKAGE_FILE        = 'package.json'
export const PACKAGE_LOCK_FILE   = 'package-lock.json'
export const CHANGELOG_FILE      = 'CHANGELOG.md'

export const GIT_MAIN_BRANCH     = 'main'
export const GIT_COMMIT_FORMAT   = 'chore(release): %s v%s'           // No quotes, execa handles that
export const GIT_TAG_FORMAT      = '%s-v%s'

export const NAME_RX = /^([^/])+\/([^/]+)(?:\/(.*))?$/
