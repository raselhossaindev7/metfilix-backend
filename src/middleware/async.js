// Async route wrapper — Express 4 does NOT catch rejected promises from
// async handlers. Without this, any DB error / bad input throws an
// unhandled rejection, the Node process dies, and Render returns
// "Bad Gateway" until it restarts. Wrap every async handler with `ah()`
// so failures become 500 JSON (see error middleware in index.js).
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
