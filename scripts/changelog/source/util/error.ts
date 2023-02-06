
// Using 'Failure' as a name to disambiguate with JS's Error
export class Failure {
    constructor(readonly message: string) {}
    toString() {
        return this.message
    }
}

export function errorToString(error: unknown, nodeErrorTexts: Record<string, string> = {}) {
    if (error instanceof Error) {
        const { code, message } = error as NodeJS.ErrnoException
        return code && nodeErrorTexts[code]
            ? nodeErrorTexts[code]
            : message
    }

    return String(error)
}
