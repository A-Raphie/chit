/**
 * Chit API server — runs on port 3001, proxied via Vite at /api
 * Exposes GET /receipt/:id for agent-to-agent settlement verification.
 *
 * RPC resolution follows the Arc Studio proxy-first pattern:
 *   1. Use RPC_PROXY_BASE_URL if Arc_Testnet is in RPC_PROXY_CHAINS.
 *   2. Otherwise fall back to the first public RPC URL from onchain-facts.
 */
import { createPublicClient, http, parseAbiItem } from "viem";
// Import chain facts so we never hardcode an RPC URL or address.
import { ONCHAIN_CHAINS } from "../src/onchain-facts.ts";

// ---------------------------------------------------------------------------
// Chain + contract config
// ---------------------------------------------------------------------------
const CHAIN_ID = 5042002; // Arc Testnet

const arcChain = ONCHAIN_CHAINS.find((c) => c.chainId === CHAIN_ID);
if (!arcChain) throw new Error("Arc Testnet not found in onchain-facts");

const RPC_URL = (() => {
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? "").split(",");
  const compassChain = "Arc_Testnet";
  if (
    process.env.RPC_PROXY_BASE_URL &&
    proxyChains.indexOf(compassChain) !== -1
  ) {
    return (
      process.env.RPC_PROXY_BASE_URL +
      "/api/rpc/" +
      compassChain +
      "?_rpc_token=" +
      process.env.RPC_PROXY_TOKEN
    );
  }
  // Public fallback — rate limits unknown, may throttle under load
  return arcChain.rpcUrls[0];
})();

const CONTRACT_ADDRESS = process.env.VITE_CHITBOOK_ADDRESS as
  | `0x${string}`
  | undefined;

// ---------------------------------------------------------------------------
// Minimal ABI for the server
// ---------------------------------------------------------------------------
const CHITBOOK_ABI = [
  {
    type: "function",
    name: "getReceipt",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        components: [
          { name: "id", type: "uint256" },
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "claimHash", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
        name: "receipt",
        type: "tuple",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "receiptCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  parseAbiItem(
    "event ReceiptIssued(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, bytes32 claimHash, string memo)"
  ),
  { type: "error", name: "InvalidReceiptId", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
] as const;

// ---------------------------------------------------------------------------
// viem client
// ---------------------------------------------------------------------------
const viemChain = {
  id: CHAIN_ID,
  name: arcChain.name,
  nativeCurrency: {
    name: arcChain.nativeCurrency.symbol,
    symbol: arcChain.nativeCurrency.symbol,
    decimals: arcChain.nativeCurrency.decimals,
  },
  rpcUrls: { default: { http: [RPC_URL] as [string] } },
} as const;

const rpcClient = createPublicClient({
  transport: http(RPC_URL),
  chain: viemChain,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface RawReceipt {
  id: bigint;
  payer: string;
  payee: string;
  amount: bigint;
  claimHash: string;
  memo: string;
  timestamp: bigint;
}

function formatReceipt(raw: RawReceipt) {
  return {
    id: raw.id.toString(),
    payer: raw.payer,
    payee: raw.payee,
    amount: raw.amount.toString(),
    amountUsdc: (Number(raw.amount) / 1e6).toFixed(6),
    claimHash: raw.claimHash,
    memo: raw.memo,
    timestamp: raw.timestamp.toString(),
    timestampIso: new Date(Number(raw.timestamp) * 1000).toISOString(),
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// HTTP server (Bun native)
// ---------------------------------------------------------------------------
const PORT = 3001;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: CORS_HEADERS,
      });
    }

    // GET /receipt/:id
    const idMatch = url.pathname.match(/^\/receipt\/(\d+)$/);
    if (idMatch && req.method === "GET") {
      if (!CONTRACT_ADDRESS) {
        return new Response(
          JSON.stringify({ error: "Contract not yet deployed" }),
          { status: 503, headers: CORS_HEADERS }
        );
      }
      const id = BigInt(idMatch[1]);
      try {
        const raw = await rpcClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CHITBOOK_ABI,
          functionName: "getReceipt",
          args: [id],
        });
        return new Response(
          JSON.stringify({ receipt: formatReceipt(raw as unknown as RawReceipt) }),
          { headers: CORS_HEADERS }
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes("InvalidReceiptId") ||
          msg.toLowerCase().includes("invalid receipt")
        ) {
          return new Response(JSON.stringify({ error: "Receipt not found" }), {
            status: 404,
            headers: CORS_HEADERS,
          });
        }
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: CORS_HEADERS,
        });
      }
    }

    // GET /receipt-count
    if (url.pathname === "/receipt-count" && req.method === "GET") {
      if (!CONTRACT_ADDRESS) {
        return new Response(
          JSON.stringify({ error: "Contract not yet deployed" }),
          { status: 503, headers: CORS_HEADERS }
        );
      }
      try {
        const count = await rpcClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CHITBOOK_ABI,
          functionName: "receiptCount",
        });
        return new Response(
          JSON.stringify({ count: count.toString() }),
          { headers: CORS_HEADERS }
        );
      } catch (e: unknown) {
        return new Response(
          JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
          }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
});

console.log(`Chit API server running on http://localhost:${PORT}`);
