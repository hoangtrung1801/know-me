declare module "bun:test" {
	interface BunExpectation {
		not: BunExpectation;
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toBeNull(): void;
	}

	export function describe(name: string, callback: () => void): void;
	export function test(name: string, callback: () => void | Promise<void>): void;
	export function expect<T>(value: T): BunExpectation;
}
