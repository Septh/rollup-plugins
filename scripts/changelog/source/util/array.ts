
export function enumerateArray(array: string[], sep: string = ', ', last_sep: string = ' and '): string {
    return array.length === 0
        ? ''
        : array.length === 1
            ? array[0]
            : `${array.slice(0, -1).join(sep)}${last_sep}${array[array.length - 1]}`
}
