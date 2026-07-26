import { router } from "../router";

export function navigateTo(to: string, options?: { replace?: boolean }) {
	// Parse query string and hash from the path so TanStack Router handles them correctly
	const hashIndex = to.indexOf("#");
	const queryIndex = to.indexOf("?");
	const splitIndex = queryIndex >= 0 ? queryIndex : hashIndex;

	let pathname = to;
	let search: Record<string, string> | undefined;
	let hash: string | undefined;

	if (splitIndex >= 0) {
		pathname = to.slice(0, splitIndex);
		const rest = to.slice(splitIndex);

		const hashStart = rest.indexOf("#");
		const queryPart = hashStart >= 0 ? rest.slice(0, hashStart) : rest;
		const hashPart = hashStart >= 0 ? rest.slice(hashStart + 1) : undefined;

		if (queryPart.startsWith("?")) {
			const params = new URLSearchParams(queryPart);
			search = {};
			params.forEach((value, key) => {
				search![key] = value;
			});
		}

		if (hashPart !== undefined) {
			hash = hashPart;
		}
	}

	return router.navigate({
		to: pathname,
		search: search as any,
		hash: hash,
		replace: options?.replace,
	});
}
