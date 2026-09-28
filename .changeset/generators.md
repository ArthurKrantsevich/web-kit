---
"@web-kit/uuid-generator": minor
"@web-kit/password-generator": minor
"@web-kit/hash-generator": minor
"@web-kit/ui": minor
---

New packages: a UUID generator (v1, v3, v4, v5, v6, v7, Nil, Max, ULID and NanoID, with Inspect), a password generator (characters, EFF passphrases, pronounceable passwords and PINs with their exact entropy) and a hash generator (MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160, CRC32 and CRC32C of texts and files up to 512 MB in workers, HMAC and Verify). `@web-kit/ui` adds `OptionStack` and `NumberField`, option groups and a steady width (`widest`) to `Select`, radio items to `Menu`, an accessible name and an icon-only form to `CopyButton`, and `onFile` to `useFileDrop` (the file itself, not read; an `accept` of every type takes any file). Every package's check now fails on `Math.random`.
