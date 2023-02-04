// @ts-check
const typesMap = {
    cjs: 'commonjs',
    es: 'module'
}

/** @type { import('rollup').PluginImpl } */
export default function packageType() {
    return {
        name: 'package-type',

        async renderStart({ format }) {
            const type = typesMap[format]
            if (type) {
                this.emitFile({
                    type: 'asset',
                    fileName: 'package.json',
                    source: JSON.stringify({ type })
                })
            }
        }
    }
}
