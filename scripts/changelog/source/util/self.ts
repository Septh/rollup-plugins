import { createRequire } from 'module'

export const self = createRequire(import.meta.url)('#self') as typeof import('../../package.json')
