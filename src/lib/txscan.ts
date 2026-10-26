import { parseAbiItem, type PublicClient } from "viem";

export const RECEIPT_ISSUED_EVENT = parseAbiItem(
  "event ReceiptIssued(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, bytes32 claimHash, string memo)"
);

// The public Arc RPC rejects eth_getLogs ranges larger than ~10k blocks
// ("requested range too large"), so tx-hash enrichment walks backwards in
// bounded windows and stops as soon as every wanted receipt is resolved.
const WINDOW = 9000n;
const MAX_WINDOWS = 32;

export async function findTxHashes(
  client: PublicClient,
  chitbook: `0x${string}`,
  ids: bigint[],
  latestBlock?: bigint
): Promise<Map<string, `0x${string}`>> {
  const byId = new Map<string, `0x${string}`>();
  const wanted = new Set(ids.map((i) => i.toString()));
  if (wanted.size === 0) return byId;

  const head = latestBlock ?? (await client.getBlockNumber());
  for (let end = head, n = 0; end > 0n && n < MAX_WINDOWS; end -= WINDOW, n++) {
    const from = end >= WINDOW ? end - WINDOW + 1n : 0n;
    try {
      const logs = await client.getLogs({
        address: chitbook,
        event: RECEIPT_ISSUED_EVENT,
        fromBlock: from,
        toBlock: end,
      });
      for (const log of logs) {
        const id = log.args?.id;
        if (id !== undefined && log.transactionHash) {
          const key = id.toString();
          if (wanted.has(key)) byId.set(key, log.transactionHash);
        }
      }
    } catch {
      // a single failed window is fine — tx links are optional enrichment
    }
    let all = true;
    for (const k of wanted) if (!byId.has(k)) { all = false; break; }
    if (all) break;
  }
  return byId;
}
