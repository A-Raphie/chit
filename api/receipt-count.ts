// GET /api/receipt-count — total chits issued (ChitBook.receiptCount)
import { createPublicClient, http } from "viem";

const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";
const CHITBOOK = (process.env.VITE_CHITBOOK_ADDRESS ||
  "0xdaf21c1619cd8361907eacad00e2415ac5aea033") as `0x${string}`;

const ABI = [
  {
    type: "function",
    name: "receiptCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export default async function handler() {
  try {
    const client = createPublicClient({ transport: http(RPC) });
    const count = (await client.readContract({
      address: CHITBOOK,
      abi: ABI,
      functionName: "receiptCount",
    })) as bigint;
    return new Response(JSON.stringify({ count: count.toString(), contract: CHITBOOK }), {
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "rpc error" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
}

export const config = { runtime: "edge" };
