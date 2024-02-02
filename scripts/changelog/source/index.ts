import { Failure } from './util/error.ts'
import { self } from './util/self.ts'
import { getOptions, helpText } from './options.ts'
import { main } from './main.ts'

const options = getOptions()
if (options instanceof Failure) {
    console.error(options.message)
    process.exitCode = 1
}
else if (options.version || options.help) {
    console.log(`${self.name} version ${self.version}`)
    if (options.help)
        console.log(helpText)
}
else {
    const result = await main(options)
    if (result instanceof Failure) {
        console.error(result.message)
        process.exitCode = 1
    }
}
