# Chit — Receipt Layer for Agent-to-Agent USDC Payments

Chit is a verifiable settlement layer for USDC payments on Arc. When one service or AI agent pays another, Chit wraps the payment in a permanent onchain receipt — both sides get checkable proof of what was paid and why.

Built with [Arc Studio](https://studio.arc.io)

## Features

- **Issue a chit**: pay a USDC amount with a claim reference (plain text or hash) and optional memo — receipt recorded onchain in the same transaction
- **Receipt view**: styled like a printed voucher slip with the chit number, payer, payee, amount, claim reference (text + hash), timestamp, and explorer link
- **Ledger**: recent receipts indexed from onchain events
- **Verify**: look up any receipt by chit number, plain claim text, keccak256 claim hash, or tx hash — the "prove it" path for the payee side
- **HTTP API**: `GET /api/receipt/:id` returns receipt JSON so any agent can verify settlement with a single request

## Tech Stack

- React 18, Vite, TypeScript, Tailwind CSS
- wagmi v2, viem, ConnectKit (wallet connection)
- Solidity 0.8.28, Foundry, OpenZeppelin 5.6.1
- Bun HTTP server (API)
- Arc Testnet (USDC as native gas)

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://getfoundry.sh) (for contract builds)
- A browser wallet (MetaMask or compatible)

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_CHITBOOK_ADDRESS` | Deployed ChitBook contract address | Yes (set after deploy) |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL | Optional outside Arc Studio |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | Optional outside Arc Studio |
| `RPC_PROXY_CHAINS` | Comma-separated proxy chain names | Optional outside Arc Studio |

## Development

```bash
bun install

# Start the Vite frontend (port 5173)
bun run dev

# Start the API server (port 3001) in a second terminal
bun run server
```

The frontend proxies `/api/*` to the API server automatically via Vite config.

## Build & Test

```bash
# Type-check + lint
bun run check

# Build contracts
bun run contracts:build

# Test contracts
bun run contracts:test
```

## Deployed Contract

ChitBook is deployed on **Arc Testnet** at `0xdaf21c1619cd8361907eacad00e2415ac5aea033`.

The contract receives no custody of funds — USDC goes directly from payer to payee within the same transaction. It only records the receipt.

## API

```
GET /api/receipt/:id
```

Returns:
```json
{
  "receipt": {
    "id": "1",
    "payer": "0x...",
    "payee": "0x...",
    "amount": "500000",
    "amountUsdc": "0.500000",
    "claimHash": "0x...",
    "memo": "...",
    "timestamp": "...",
    "timestampIso": "2026-10-24T16:11:15.000Z"
  }
}
```
