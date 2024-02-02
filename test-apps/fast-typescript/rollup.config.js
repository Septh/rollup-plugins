// @ts-check
import fastTypescript from 'rollup-plugin-fast-typescript'
import externals from 'rollup-plugin-node-externals'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { defineConfig } from 'rollup'

export default defineConfig({
    input: 'source/index.ts',
    output: {
        dir: 'dist',
        generatedCode: 'es2015'
    },
    plugins: [
        externals(),
        resolve(),
        commonjs(),
        fastTypescript('esbuild')
    ]
})
