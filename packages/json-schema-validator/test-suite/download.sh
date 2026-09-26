#!/usr/bin/env bash
# Downloads the JSON-Schema-Test-Suite files this package runs, at a pinned commit, and checks their content.
# Usage: bash download.sh                download and verify against SHA256SUMS
#        bash download.sh --update-sums  download and rewrite SHA256SUMS (after changing COMMIT)
set -euo pipefail
cd "$(dirname "$0")"

COMMIT=f6fd52a0a95472e079cbfc6ef7f089702b80e045 # tag Test-JSON-Schema-Acceptance-1.039
BASE="https://raw.githubusercontent.com/json-schema-org/JSON-Schema-Test-Suite/$COMMIT"
DRAFT=tests/draft2020-12
FILES=(
  LICENSE
  $DRAFT/additionalProperties.json
  $DRAFT/allOf.json
  $DRAFT/anyOf.json
  $DRAFT/boolean_schema.json
  $DRAFT/const.json
  $DRAFT/contains.json
  $DRAFT/default.json
  $DRAFT/enum.json
  $DRAFT/exclusiveMaximum.json
  $DRAFT/exclusiveMinimum.json
  $DRAFT/format.json
  $DRAFT/if-then-else.json
  $DRAFT/infinite-loop-detection.json
  $DRAFT/items.json
  $DRAFT/maxContains.json
  $DRAFT/maxItems.json
  $DRAFT/maxLength.json
  $DRAFT/maxProperties.json
  $DRAFT/maximum.json
  $DRAFT/minContains.json
  $DRAFT/minItems.json
  $DRAFT/minLength.json
  $DRAFT/minProperties.json
  $DRAFT/minimum.json
  $DRAFT/multipleOf.json
  $DRAFT/not.json
  $DRAFT/oneOf.json
  $DRAFT/pattern.json
  $DRAFT/patternProperties.json
  $DRAFT/prefixItems.json
  $DRAFT/properties.json
  $DRAFT/ref.json
  $DRAFT/required.json
  $DRAFT/type.json
  $DRAFT/uniqueItems.json
  $DRAFT/optional/bignum.json
  $DRAFT/optional/ecmascript-regex.json
  $DRAFT/optional/float-overflow.json
  $DRAFT/optional/non-bmp-regex.json
  $DRAFT/optional/format/date-time.json
  $DRAFT/optional/format/date.json
  $DRAFT/optional/format/email.json
  $DRAFT/optional/format/ipv4.json
  $DRAFT/optional/format/ipv6.json
  $DRAFT/optional/format/uri.json
  $DRAFT/optional/format/uuid.json
)

for file in "${FILES[@]}"; do
  curl -fsSL --retry 5 --retry-all-errors --create-dirs -o "$file" "$BASE/$file"
done

if [ "${1:-}" = "--update-sums" ]; then
  sha256sum "${FILES[@]}" > SHA256SUMS
  echo "SHA256SUMS rewritten for $COMMIT"
else
  sha256sum -c --quiet SHA256SUMS
  echo "test suite OK: ${#FILES[@]} files at $COMMIT"
fi
