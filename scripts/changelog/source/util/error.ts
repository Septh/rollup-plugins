
// Using 'Failure' as a name to disambiguate with JS's Error
export class Failure {
    message: string

    constructor(message: string, ...optionalArgs: any[]) {
        this.message = message.replaceAll(/\$(\d+)/g, (_, index) => optionalArgs[Number(index) - 1])
    }

    toString() {
        return this.message
    }
}

export function errorToString(error: unknown, nodeErrorTexts: Record<string, string> = {}) {
    if (error instanceof Error) {
        const { code, message } = error as NodeError
        return code && nodeErrorTexts[code]
            ? nodeErrorTexts[code]
            : message
    }

    return String(error)
}
