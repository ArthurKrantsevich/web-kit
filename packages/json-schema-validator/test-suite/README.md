# JSON-Schema-Test-Suite (subset)

These files come unchanged from the official [JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite):

- version: tag `Test-JSON-Schema-Acceptance-1.039`, commit `f6fd52a0a95472e079cbfc6ef7f089702b80e045` (2026-09-06);
- license: MIT, Copyright (c) 2012 Julian Berman; the full text is in `LICENSE` next to this file.

Only the draft 2020-12 files for keywords this package checks are copied; `download.sh` lists them and `SHA256SUMS` pins their content. `src/core/suite.test.ts` runs every case in them. The cases whose expected answer the package knowingly does not give are listed there in `DEVIATIONS`, each with its reason, and each must fail in the stated explicit way (a schema error, or "invalid" for an asserted format).

To move to a newer suite: change `COMMIT` in `download.sh`, run `bash download.sh --update-sums`, read the diff of the test files, run the tests, and update this README.
