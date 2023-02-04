import { Plugin } from 'rollup'

/**
 * A micro-plugin that emits a package.json file with just the `type` field
 * set to either `module` or `commonjs`, based on the current output format.
 */
declare function packageType(): Plugin
export { packageType, packageType as default }
