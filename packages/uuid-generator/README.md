# @web-kit/uuid-generator

UUID v1, v3, v4, v5, v6 and v7, the Nil and Max UUIDs, ULID and NanoID, one or up to 1,000 at a time, and any UUID or ULID taken apart: version, variant, time, clock sequence and node.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { formatUuid, generateIds, inspectId, nanoid, ulid, uuidV4, uuidV5, uuidV7 } from "@web-kit/uuid-generator/core";

uuidV4(); // "3f2b8c1e-5d4a-4f6b-9a0c-1e2d3c4b5a69"
uuidV7(); // "019237c1-e8a0-7d42-8f6b-3c1a2b4d5e6f": strictly increasing within this page
uuidV5("dns", "www.example.com"); // { ok: true, value: "2ed6657d-e927-568b-95e1-2665a8aea6a2" }
ulid(); // "01J8ZQ4C8X4Q5K7N2M3P6R9T0V"
nanoid({ size: 12, alphabet: "0123456789abcdef" }); // { ok: true, value: "3f9a0c1e2d7b" }
generateIds({ kind: "v7", count: 100 }); // { ok: true, value: [100 UUIDs] }
formatUuid("2ed6657d-e927-568b-95e1-2665a8aea6a2", { case: "upper", wrap: "braces" }); // "{2ED6657D-E927-568B-95E1-2665A8AEA6A2}"
inspectId("C232AB00-9414-11EC-B3C8-9F6BDECED846");
// { ok: true, value: { kind: "uuid", version: 1, variant: "rfc9562", time: "2022-02-22T19:22:22.0000000Z",
//   clockSequence: 13256, node: "9f:6b:de:ce:d8:46", nodeRandom: true, … } }
```

- Randomness comes only from `crypto.getRandomValues`: no `Math.random` anywhere (the package check fails on it). `createIdGenerators({ random, now })` gives generators with their own state and source, for tests.
- **v7** follows RFC 9562 §6.2 method 1: 48-bit Unix milliseconds, a 12-bit counter that starts at a random value in each new millisecond, 62 random bits. When the counter is full, or the clock goes back, the next millisecond is borrowed, so values made on one page always increase.
- **v1 and v6** count 100-ns intervals since 1582-10-15 and never repeat a time on one page. The clock sequence is random, and the node is 48 random bits with the multicast bit set (§6.10): never a MAC address. v6 has v1's fields in an order that sorts by time.
- **v3 and v5** are MD5 and SHA-1 of the namespace's 16 bytes and the name in UTF-8. The namespaces of §6.6 are `"dns"`, `"url"`, `"oid"` and `"x500"`; any UUID can be a namespace. The same inputs always give the same UUID.
- **ULID** is 48-bit milliseconds and 80 random bits in 26 characters of Crockford's Base32. Within one millisecond the random part counts up by one; if it cannot (after 2⁸⁰ values) the next millisecond is used (the `ulid` library throws there).
- **NanoID** takes 2 to 255 characters from an alphabet of 2 to 256 different characters. Random bytes are masked to the smallest power of two over the alphabet and values past its end are thrown away, so no character is favoured.
- `generateIds` makes 1 to 1,000 of one kind (v3 and v5 one per name) and returns `{ ok: false, error: { message } }` for a count, namespace or alphabet it cannot use.
- `inspectId` reads a UUID with or without hyphens, in braces, as `urn:uuid:…` and in any case, or a ULID. It gives the variant (RFC 9562, NCS, Microsoft, future), the version, the time of v1, v6 (to 100 ns), v7 and ULID in ISO 8601 UTC, and the clock sequence and node of v1 and v6. It says why an ID cannot be read: its length, a wrong character and where, an unknown version, a lookalike in a ULID (`O` for `0`). A NanoID has no structure, and the message says so.
- The tests check RFC 9562's test vectors (appendix A: v1, v3, v4, v5, v6, v7), the ULID spec's monotonic examples, Python's `uuid` module for more v3 and v5 values, and NanoID's bias with a χ² test.

## React component

```tsx
import { UuidGenerator } from "@web-kit/uuid-generator";
import "@web-kit/uuid-generator/styles.css";

export function Page() {
  return <UuidGenerator initialSettings={{ kind: "v7" }} />;
}
```

The toolbar has the kind (UUID v4, v7, v1, v6, v5, v3, Nil, Max; ULID, NanoID), Count, Format (upper case, hyphens, no wrapping, braces or URN; case for ULID) and Lines or JSON, then Regenerate (Ctrl+Enter) and More actions (share link, saved settings, shortcuts). Under it, a box of one height at every width holds fields only, in one row from 600 px of the tool's width and two below: the namespace (and your own namespace UUID) for v3 and v5, the size and alphabet for NanoID, and for the other kinds one line of facts with what the kind is in its tooltip. For v3 and v5 the output pane is Names → IDs: the names you type on the left, each UUID on its name's line on the right (an empty line makes none), also as JSON. The IDs pane has Download (`uuids.txt` or `uuids.json`) and Copy; the Inspect pane reads a pasted UUID or ULID. A share link and the saved input keep the settings, never the IDs. `useUuidGenerator()` gives the same state without markup; set `--wk-uuid-height` to change the height of the panes.

## License

MIT
