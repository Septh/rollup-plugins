#!/usr/bin/env node

import 'source-map-support/register.js'
import { argv } from './build/argv.js'
if (argv.help) {
    // TODO
}
else {
    const { run } = await import('./build/index.js')
    run(argv)
}
