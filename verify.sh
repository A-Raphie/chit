#!/usr/bin/env bash
# Chit claim verifier — reads Arc testnet directly, then checks the public API.
# No trusted server: contract reads come straight from the public RPC.
set -u

RPC="https://rpc.testnet.arc.io"
CHITBOOK="0xdaf21c1619cd8361907eacad00e2415ac5aea033"
API="https://chit-sigma-khaki.vercel.app"
TX="0x62f75ad4f84b1bb20145e523faff025b0c0e5c6ac553b2990684781245abe6f1"
RECEIPT_TOPIC0="0xfbb28daff562dc70db0d23eac05021aa26a1c5950b2b739d6c8da82d90325968"

command -v curl >/dev/null || { echo "curl required"; exit 1; }
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

rpc() { # method, params -> json
  curl -s --max-time 30 -X POST "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
}

echo "== ChitBook on Arc testnet ($CHITBOOK) =="

# 1 + 2 + 3: code, count, and receipt #1 straight from the RPC
rpc eth_getCode "[\"$CHITBOOK\",\"latest\"]" > /tmp/v_code.json
rpc eth_call "[{\"to\":\"$CHITBOOK\",\"data\":\"0x7f038f3c\"},\"latest\"]" > /tmp/v_count.json   # receiptCount()
rpc eth_call "[{\"to\":\"$CHITBOOK\",\"data\":\"0xb63e6ac3$(printf '%064d' 1)\"},\"latest\"]" > /tmp/v_r1.json # getReceipt(1)
rpc eth_getTransactionReceipt "[\"$TX\"]" > /tmp/v_tx.json

PASS=0; FAIL=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

python3 - "$CHITBOOK" "$RECEIPT_TOPIC0" <<'EOF'
import json, sys

chitbook = sys.argv[1].lower()
topic0 = sys.argv[2]
results = []

def load(p):
    with open(p) as f:
        return json.load(f)

def rec(name, cond, detail=""):
    results.append((name, bool(cond), detail))

# 1. contract code exists
code = load("/tmp/v_code.json").get("result", "")
rec("contract has onchain code", len(code) > 2, f"{len(code)//2-1} bytes")

# 2. receiptCount >= 1
count = int(load("/tmp/v_count.json")["result"], 16)
rec(f"receiptCount = {count} (>= 1 receipts onchain)", count >= 1)

# 3. getReceipt(1): tuple output sits behind an offset word
r = load("/tmp/v_r1.json")["result"][2:]
def w(i): return r[i*64:(i+1)*64]
payer  = "0x" + w(2)[24:]
payee  = "0x" + w(3)[24:]
amount = int(w(4), 16) / 1e6
claim  = "0x" + w(5)
detail = f"chit #1: {payer} -> {payee} {amount:.6f} USDC claim {claim[:18]}…"
rec("chit #1 = 0.5 USDC, claimed payer -> claimed payee",
    payer == "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    and payee == "0xc38bc47f8de8a361ce9ccb07fed90a7df9c34bfe"
    and abs(amount - 0.5) < 1e-9, detail)

# 4. tx receipt: succeeded + emitted ReceiptIssued from ChitBook
txr = load("/tmp/v_tx.json").get("result")
ev = bool(txr) and int(txr["status"], 16) == 1 and any(
    l["address"].lower() == chitbook and l["topics"][0] == topic0
    for l in txr["logs"]
)
rec("tx 0x62f7…e6f1 succeeded and emitted ReceiptIssued from ChitBook", ev)

with open("/tmp/v_chain.txt", "w") as f:
    for name, cond, detail in results:
        f.write(("PASS  " if cond else "FAIL  ") + name + ("\n      " + detail if detail else "") + "\n")
EOF

while IFS= read -r line; do
  case "$line" in
    PASS*) ok "${line#PASS  }";;
    FAIL*) bad "${line#FAIL  }";;
    *) [ -n "$line" ] && echo "$line";;
  esac
done < /tmp/v_chain.txt

# 5 + 6: public API agrees with the chain
APIJSON=$(curl -s --max-time 20 "$API/api/receipt/1")
echo "$APIJSON" | grep -q '"amountUsdc": *"0.500000"' && ok "public API /api/receipt/1 serves the same settlement" || bad "public API /api/receipt/1 serves the same settlement"
echo "$APIJSON" | grep -q '"memo": *"api calls batch 417"' && ok "public API returns the claim memo" || bad "public API returns the claim memo"

echo
echo "== $PASS passed, $FAIL failed =="
if [ "$FAIL" = "0" ]; then echo "ALL CLAIMS VERIFIED AGAINST THE CHAIN"; else exit 1; fi
