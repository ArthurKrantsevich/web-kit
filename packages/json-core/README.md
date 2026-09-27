# @web-kit/json-core

Lossless JSON tooling with no dependencies and no UI: a parser that reports exact error positions, an AST that keeps numbers and strings exactly as written, verified fix suggestions, code frames, paths and exact number comparison.

> Not published to npm yet. The package name will change before the first release.

```ts
import { parseJson, printJson, formatPath, pathOf, getStats, compareNumbers } from "@web-kit/json-core";

const result = parseJson('{"b": 12345678901234567890, "a": 1}');
if (result.ok) {
  printJson(result.value, { sortKeys: true }); // {"a": 1, "b": 12345678901234567890}, nothing rounded
}
```

Used by `@web-kit/json-formatter` and the other JSON tools in web-kit.

## Large inputs: the worker

`@web-kit/json-core/worker` is a worker script that parses, formats or minifies, counts and suggests fixes off the main thread. `@web-kit/json-core/worker-client` starts it and runs one job at a time:

```ts
import { runJsonJob } from "@web-kit/json-core";
import { createJsonJobRunner, JsonWorkerError } from "@web-kit/json-core/worker-client";

const runner = createJsonJobRunner();
const job = { input: bigText, mode: "format", indent: 2, sortKeys: false } as const;
runner.run(job).then(show, (error) => {
  if (error instanceof JsonWorkerError && error.reason === "unavailable") show(runJsonJob(job)); // same code, main thread
});
```

- A new `run()` cancels the job still running: its worker is terminated and a fresh one takes the new job, so at most one worker is alive. `dispose()` terminates it.
- The worker is started with `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`, the shape webpack, Vite, Turbopack and Parcel look for. With Vite, add `@web-kit/json-core` to `optimizeDeps.exclude`, or its dependency pre-bundling moves the file away from `worker.js`.
- When a worker cannot start (strict CSP without `worker-src 'self'`, an old browser, a script that fails to load), jobs reject with reason `"unavailable"`; do the work with `runJsonJob` instead and tell the user it may freeze the page.
- The worker logs nothing and never puts the input into an error.

## License

MIT
