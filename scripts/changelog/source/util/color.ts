import { createColors } from 'colorette'

const colors = createColors()

export function bold(...texts: string[]) {
    return colors.bold(texts.join(' '))
}

export function cyan(...texts: string[]) {
    return colors.cyan(texts.join(' '))
}

export function blue(...texts: string[]) {
    return colors.blue(texts.join(' '))
}

export function yellow(...texts: string[]) {
    return colors.yellow(texts.join(' '))
}

export function red(...texts: string[]) {
    return colors.red(texts.join(' '))
}

export function magentaBright(...texts: string[]) {
    return colors.magentaBright(texts.join(' '))
}
