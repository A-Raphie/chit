# Chit — Receipt Layer for Agent-to-Agent USDC Payments

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** — what Arc Studio remembers about building this app.

---

## What This App Does

Chit wraps every USDC payment in a verifiable onchain receipt. The payer calls `pay(payee, amount, claimHash, memo)` on the ChitBook contract, which pulls USDC via `transferFrom` and records a permanent receipt. Both sides get a checkable proof of settlement. A JSON API endpoint lets agents verify receipts programmatically.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry + OpenZeppelin 5.6.1. Sources in `contracts/`, build with `bun run contracts:build`.
- Backend API: Bun HTTP server (`server/index.ts`) on port 3001, proxied via Vite at `/api`
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC at `0x3600000000000000000000000000000000000000` (6 decimals ERC-20)

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| ChitBook | Arc Testnet | `0xdaf21c1619cd8361907eacad00e2415ac5aea033` | https://explorer.testnet.arc.io/address/0xdaf21c1619cd8361907eacad00e2415ac5aea033 |

Deploy tx: `0x60f983844a373d0c180d15caf36ed3ab531832e3e52e61c41da9b238486d56ce`

## Key Files

- `contracts/ChitBook.sol` — Main contract (pay + receipt storage)
- `contracts/contract-metadata/ChitBook.json` — Deployment metadata
- `src/App.tsx` — Screen router (Pay / Ledger / Verify / Receipt)
- `src/components/PayScreen.tsx` — Approve + pay flow
- `src/components/ReceiptView.tsx` — Voucher slip receipt display
- `src/components/LedgerScreen.tsx` — Recent receipts from events
- `src/components/VerifyScreen.tsx` — Verify by chit#, claimHash, txHash, or plain text
- `src/lib/chitbook.ts` — Contract ABI + address constants
- `server/index.ts` — Bun HTTP API server (GET /receipt/:id)

## Environment Variables

- `VITE_CHITBOOK_ADDRESS` — Deployed ChitBook contract address (set after deploy)
- `RPC_PROXY_BASE_URL` / `RPC_PROXY_TOKEN` / `RPC_PROXY_CHAINS` — Arc Studio RPC proxy (optional outside Arc Studio)

## To Run

```bash
bun install
bun run dev          # Vite frontend on :5173
bun run server       # API server on :3001
```

## API

`GET /api/receipt/:id` — Returns receipt JSON for the given chit number.
