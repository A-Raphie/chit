// Chit receipt API — GET /api/receipt/1 (rewritten to ?id=1) or /api/receipt?id=1
import { createPublicClient, http } from "viem";

const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";
const CHITBOOK = (process.env.VITE_CHITBOOK_ADDRESS ||
  "0xdaf21c1619cd8361907eacad00e2415ac5aea033") as `0x${string}`;

const ABI = [
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
        internalType: "struct ChitBook.Receipt",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
  },
] as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop() || "";
  if (!/^\d+$/.test(id)) {
    return new Response(JSON.stringify({ error: "invalid id" }), { status: 400, headers: CORS });
  }
  try {
    const client = createPublicClient({ transport: http(RPC) });
    const r = (await client.readContract({
      address: CHITBOOK,
      abi: ABI,
      functionName: "getReceipt",
      args: [BigInt(id)],
    })) as { id: bigint; payer: string; payee: string; amount: bigint; claimHash: string; memo: string; timestamp: bigint };

    return new Response(
      JSON.stringify(
        {
          receipt: {
            id: r.id.toString(),
            payer: r.payer,
            payee: r.payee,
            amount: r.amount.toString(),
            amountUsdc: (Number(r.amount) / 1e6).toFixed(6),
            claimHash: r.claimHash,
            memo: r.memo,
            timestamp: r.timestamp.toString(),
            timestampIso: new Date(Number(r.timestamp) * 1000).toISOString(),
            contract: CHITBOOK,
            chain: "Arc",
            explorer: `https://explorer.testnet.arc.io/address/${CHITBOOK}`,
          },
        },
        null,
        2
      ),
      { headers: CORS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = /InvalidReceiptId|invalid receipt/i.test(msg);
    return new Response(
      JSON.stringify({ error: notFound ? "Receipt not found" : msg }),
      { status: notFound ? 404 : 500, headers: CORS }
    );
  }
}

export const config = { runtime: "edge" };
