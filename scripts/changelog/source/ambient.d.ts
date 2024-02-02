declare global {
	interface NodeError extends Error {
		code: string
	}
}

// This file needs to be a module
export {}
