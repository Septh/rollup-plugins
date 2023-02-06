#!/usr/bin/env node
import 'source-map-support/register.js'
import { argv } from './out/argv.js'
if (argv.version) {
    // TODO
}
else if (argv.help) {
    // TODO
}
else {
    const { run } = await import('./out/index.js')
    run(argv)
}
