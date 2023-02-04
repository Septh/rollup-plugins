
export function enumerateArray(array: string[], sep: string = ', ', last_sep: string = ' and '): string {
    if (array.length === 0)
        return ''

    const last = array.pop()!
    return array.length === 0
        ? last
        : `${array.join(sep)}${last_sep}${last}`
}
