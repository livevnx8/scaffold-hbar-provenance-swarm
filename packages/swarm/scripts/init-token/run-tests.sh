#!/usr/bin/env bash
# CLI end-to-end tests for init-token.ts. Keyless: throwaway keys are generated
# in-memory per run, never funded, never used on-chain. Read-only mirror
# queries only. Exits nonzero if any test fails.
set -u
# Hermetic: clear ambient Hedera credentials injected into the shell so
# keyless assertions (missing key, dual-curve candidates) are deterministic.
unset HEDERA_OPERATOR_ID HEDERA_OPERATOR_KEY HEDERA_KEY_TYPE HEDERA_NETWORK \
  HEDERA_CERTIFICATE_TOKEN_ID HEDERA_TEMPLATE_TOPIC_ID HEDERA_PROVENANCE_TOPIC_ID \
  HEDERA_REGISTRY_ADDRESS HEDERA_RPC_URL HEDERA_EXHIBIT_TOPIC_ID \
  HEDERA_TESTNET_OPERATOR_KEY 2>/dev/null || true
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TSX="${REPO_ROOT}/node_modules/.bin/tsx"
TDIR=$(mktemp -d)
trap 'rm -rf "$TDIR"' EXIT
cd "$SCRIPT_DIR"

pass=0; fail=0
check() { # name expected_exit actual_exit
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS $1 (exit $3)"; else fail=$((fail+1)); echo "  FAIL $1 (expected $2, got $3)"; fi
}

# throwaway keys (never funded, never used on-chain)
# NOTE: gen.ts must live under a path where node_modules resolution finds @hashgraph/sdk.
cat > "$SCRIPT_DIR/.gen-keys.tmp.ts" <<'EOF'
import { PrivateKey } from '@hashgraph/sdk';
console.log(PrivateKey.generateED25519().toStringRaw());
console.log(PrivateKey.generateECDSA().toStringRaw());
EOF
KEYS=$("$TSX" "$SCRIPT_DIR/.gen-keys.tmp.ts")
rm -f "$SCRIPT_DIR/.gen-keys.tmp.ts"
[ -n "$KEYS" ] || { echo "FATAL: key generation failed"; exit 2; }
KEY_ED=$(echo "$KEYS" | sed -n 1p)
KEY_EC=$(echo "$KEYS" | sed -n 2p)

echo "== T2: dry-run, missing .env =="
OUT=$(HEDERA_OPERATOR_ID=0.0.4242 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --dry-run --env "$TDIR/nope/.env" 2>&1); EC=$?
check "T2 exit 0" 0 $EC
echo "$OUT" | grep -q "dry-run: no on-chain transaction, no file written." && echo "  PASS T2 plan banner" && pass=$((pass+1)) || { echo "  FAIL T2 plan banner"; fail=$((fail+1)); }
echo "$OUT" | grep -q "Provenance Certificate" && echo "  PASS T2 shows collection plan" && pass=$((pass+1)) || { echo "  FAIL T2 plan"; fail=$((fail+1)); }
[ ! -e "$TDIR/nope/.env" ] && echo "  PASS T2 file not created" && pass=$((pass+1)) || { echo "  FAIL T2 file created"; fail=$((fail+1)); }

echo "== T3: dry-run, .env exists without token line =="
printf '# comment\nHEDERA_NETWORK=testnet\nHEDERA_OPERATOR_ID=0.0.4242\n' > "$TDIR/e3.env"
OUT=$(HEDERA_OPERATOR_ID=0.0.4242 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T3 exit 0" 0 $EC
echo "$OUT" | grep -q "append" && echo "  PASS T3 append plan" && pass=$((pass+1)) || { echo "  FAIL T3 plan"; fail=$((fail+1)); }
grep -q "HEDERA_CERTIFICATE_TOKEN_ID" "$TDIR/e3.env" && { echo "  FAIL T3 file modified in dry-run"; fail=$((fail+1)); } || { echo "  PASS T3 file untouched"; pass=$((pass+1)); }

echo "== T4: configured real token vs wrong operator -> MISMATCH, exit 1, untouched =="
printf 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.10649238\n' > "$TDIR/e4.env"
cp "$TDIR/e4.env" "$TDIR/e4.orig"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --env "$TDIR/e4.env" 2>&1); EC=$?
check "T4 exit 1" 1 $EC
echo "$OUT" | grep -q "mismatch: treasury" && echo "  PASS T4 treasury mismatch reported" && pass=$((pass+1)) || { echo "  FAIL T4 treasury"; fail=$((fail+1)); }
echo "$OUT" | grep -q "supply key mismatch" && echo "  PASS T4 supply-key mismatch reported" && pass=$((pass+1)) || { echo "  FAIL T4 supply key"; fail=$((fail+1)); }
cmp -s "$TDIR/e4.env" "$TDIR/e4.orig" && echo "  PASS T4 file untouched" && pass=$((pass+1)) || { echo "  FAIL T4 file modified"; fail=$((fail+1)); }

echo "== T5: malformed token id -> exit 1 before network =="
printf 'HEDERA_CERTIFICATE_TOKEN_ID=abc\n' > "$TDIR/e5.env"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --env "$TDIR/e5.env" 2>&1); EC=$?
check "T5 exit 1" 1 $EC
echo "$OUT" | grep -q "not a 0.0.N token id" && echo "  PASS T5 format error" && pass=$((pass+1)) || { echo "  FAIL T5 message"; fail=$((fail+1)); }

echo "== T6: missing operator key -> exit 1 =="
OUT=$(HEDERA_OPERATOR_ID=0.0.1 "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T6 exit 1" 1 $EC
echo "$OUT" | grep -q "HEDERA_OPERATOR_KEY is not set" && echo "  PASS T6 message" && pass=$((pass+1)) || { echo "  FAIL T6 message"; fail=$((fail+1)); }

echo "== T7: mainnet refused =="
OUT=$(HEDERA_NETWORK=mainnet HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T7 exit 1" 1 $EC
echo "$OUT" | grep -qi "refusing.*mainnet" && echo "  PASS T7 refusal" && pass=$((pass+1)) || { echo "  FAIL T7 message"; fail=$((fail+1)); }

echo "== T8: bad operator id =="
OUT=$(HEDERA_OPERATOR_ID=0.0 HEDERA_OPERATOR_KEY="$KEY_EC" \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T8 exit 1" 1 $EC

echo "== T9: raw key without HEDERA_KEY_TYPE -> proceeds with both candidates =="
OUT=$(HEDERA_OPERATOR_ID=0.0.4242 HEDERA_OPERATOR_KEY="$KEY_EC" \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T9 exit 0" 0 $EC
echo "$OUT" | grep -q "operator pubkey (ed25519)" && echo "$OUT" | grep -q "operator pubkey (ecdsa)" \
  && echo "  PASS T9 both candidates listed" && pass=$((pass+1)) || { echo "  FAIL T9 candidates"; fail=$((fail+1)); }

echo "== T12: valid-format but nonexistent token -> 404, fail closed =="
printf 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.999999999\n' > "$TDIR/e12.env"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --env "$TDIR/e12.env" 2>&1); EC=$?
check "T12 exit 1" 1 $EC
echo "$OUT" | grep -q "not found on testnet mirror" && echo "  PASS T12 404 handled" && pass=$((pass+1)) || { echo "  FAIL T12 message"; fail=$((fail+1)); }

echo "== T14: no key material in any output =="
OUT_ALL=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1)
OUT_ALL="$OUT_ALL $(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --env "$TDIR/e4.env" 2>&1)"
if echo "$OUT_ALL" | grep -q "$KEY_EC"; then echo "  FAIL T14 key leaked"; fail=$((fail+1)); else echo "  PASS T14 no key material in output"; pass=$((pass+1)); fi

echo "== T15: lock contention -> exit 1 with clear message; released after run =="
printf 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.10649238\n' > "$TDIR/e15.env"
printf 'pid=99999\n' > "$TDIR/e15.env.init-token.lock"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e15.env" 2>&1); EC=$?
check "T15 lock contention exit 1" 1 $EC
echo "$OUT" | grep -q "holds the lock" && echo "  PASS T15 lock message" && pass=$((pass+1)) || { echo "  FAIL T15 lock message"; fail=$((fail+1)); }
rm -f "$TDIR/e15.env.init-token.lock"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e15.env" 2>&1); EC=$?
[ ! -e "$TDIR/e15.env.init-token.lock" ] && echo "  PASS T15 lock released after run" && pass=$((pass+1)) || { echo "  FAIL T15 lock left behind"; fail=$((fail+1)); }

echo "== T16: network mapping refusals =="
OUT=$(HEDERA_NETWORK=previewnet HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T16 previewnet refused (testnet only)" 1 $EC
echo "$OUT" | grep -q "testnet only" && echo "  PASS T16 previewnet message" && pass=$((pass+1)) || { echo "  FAIL T16 previewnet message"; fail=$((fail+1)); }
OUT=$(HEDERA_NETWORK=bogusnet HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" \
  "$TSX" init-token.ts --dry-run --env "$TDIR/e3.env" 2>&1); EC=$?
check "T16 unknown network refused" 1 $EC
echo "$OUT" | grep -q 'unknown HEDERA_NETWORK' && echo "  PASS T16 unknown-network message" && pass=$((pass+1)) || { echo "  FAIL T16 unknown-network message"; fail=$((fail+1)); }

echo "== T17: --help prints usage + NOTES =="
OUT=$("$TSX" init-token.ts --help 2>&1); EC=$?
check "T17 help exit 0" 0 $EC
echo "$OUT" | grep -q "NOTES" && echo "  PASS T17 NOTES section" && pass=$((pass+1)) || { echo "  FAIL T17 NOTES"; fail=$((fail+1)); }
echo "$OUT" | grep -q "expiry is final" && echo "  PASS T17 no-admin-key consequence documented" && pass=$((pass+1)) || { echo "  FAIL T17 consequence"; fail=$((fail+1)); }
echo "$OUT" | grep -q "never read from the target .env" && echo "  PASS T17 credential boundary documented" && pass=$((pass+1)) || { echo "  FAIL T17 boundary"; fail=$((fail+1)); }

echo "== T18: duplicate live TOKEN lines -> canonical-last warning before verify =="
printf 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.1\nA=1\nHEDERA_CERTIFICATE_TOKEN_ID=0.0.999999999\n' > "$TDIR/e18.env"
OUT=$(HEDERA_OPERATOR_ID=0.0.1 HEDERA_OPERATOR_KEY="$KEY_EC" HEDERA_KEY_TYPE=ecdsa \
  "$TSX" init-token.ts --env "$TDIR/e18.env" 2>&1); EC=$?
check "T18 exit 1 (404 fail-closed)" 1 $EC
echo "$OUT" | grep -q "2 live occurrences" && echo "  PASS T18 duplicate warning" && pass=$((pass+1)) || { echo "  FAIL T18 warning"; fail=$((fail+1)); }

echo ""
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
