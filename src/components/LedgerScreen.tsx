import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { Amount, usdcDecimalsFor } from "@/onchain-money";
import { CHITBOOK_ADDRESS, CHITBOOK_ABI, type ChitReceipt } from "@/lib/chitbook";
import { findTxHashes } from "@/lib/txscan";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { ExternalLink, RefreshCw } from "lucide-react";

const CHAIN_ID = 5042002;
const MAX_ROWS = 8;

interface LedgerEntry {
  id: bigint;
  payer: `0x${string}`;
  payee: `0x${string}`;
  amount: bigint;
  claimHash: `0x${string}`;
  memo: string;
  timestamp?: bigint;
  txHash?: `0x${string}`;
}

interface Props {
  onSelectReceipt: (receipt: ChitReceipt, txHash?: `0x${string}`) => void;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LedgerScreen({ onSelectReceipt }: Props) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const fetchLedger = useCallback(async () => {
    if (!CHITBOOK_ADDRESS || !client) return;
    setLoading(true);
    setError(null);
    try {
      // Source of truth is the contract itself: receiptCount + getReceipt,
      // newest first. Event logs are only enrichment for tx links.
      const count = (await client.readContract({
        address: CHITBOOK_ADDRESS,
        abi: CHITBOOK_ABI,
        functionName: "receiptCount",
      })) as bigint;

      if (count === 0n) {
        setEntries([]);
        setLastFetched(Date.now());
        return;
      }

      const newest = Number(count);
      const oldest = Math.max(1, newest - MAX_ROWS + 1);
      const ids: bigint[] = [];
      for (let i = newest; i >= oldest; i--) ids.push(BigInt(i));

      const raws = (await Promise.all(
        ids.map((id) =>
          client.readContract({
            address: CHITBOOK_ADDRESS!,
            abi: CHITBOOK_ABI,
            functionName: "getReceipt",
            args: [id],
          })
        )
      )) as unknown as Array<{
        payer: Address; payee: Address; amount: bigint;
        claimHash: `0x${string}`; memo: string; timestamp: bigint;
      }>;

      // tx-hash enrichment: backwards chunked log scan (RPC caps log ranges)
      const txById = await findTxHashes(client, CHITBOOK_ADDRESS, ids);

      const parsed: LedgerEntry[] = raws.map((r, idx) => ({
        id: ids[idx],
        payer: r.payer,
        payee: r.payee,
        amount: r.amount,
        claimHash: r.claimHash,
        memo: r.memo,
        timestamp: r.timestamp,
        txHash: txById.get(ids[idx].toString()),
      }));
      setEntries(parsed);
      setLastFetched(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  const didFetch = useRef(false);
  useEffect(() => {
    didFetch.current = false;
  }, [client]);
  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetchLedger().catch(() => {});
  });

  async function openReceipt(entry: LedgerEntry) {
    if (!CHITBOOK_ADDRESS || !client) return;
    try {
      const raw = await client.readContract({
        address: CHITBOOK_ADDRESS!,
        abi: CHITBOOK_ABI,
        functionName: "getReceipt",
        args: [entry.id],
      });
      onSelectReceipt(raw, entry.txHash);
    } catch {
      // fall through
    }
  }

  if (!CHITBOOK_ADDRESS) {
    return (
      <div className="bg-[#a07830]/10 border border-[#a07830]/40 rounded-lg p-6 text-sm text-[#7a5a20] font-mono text-center">
        Contract not deployed yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b-2 border-[#2a1f0e] pb-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#2a1f0e] tracking-tight">Ledger</h1>
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-[#2a1f0e]/50 mt-1">
            Every chit ever issued, straight from the contract
          </p>
        </div>
        <button
          onClick={() => { void fetchLedger(); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/70 bg-[#f5f0e8] border-2 border-[#2a1f0e] px-3 py-2 rounded-md hover:-translate-y-px hover:shadow-[2px_2px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-[#a02c20]/10 border border-[#a02c20]/40 rounded-lg p-4 text-sm text-[#a02c20] font-mono">
          {error}
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#fffaf0] border-2 border-[#2a1f0e]/15 rounded-lg h-24 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <div className="border-2 border-dashed border-[#2a1f0e]/35 rounded-lg p-14 text-center bg-[#fffaf0]/60">
          <p className="font-mono text-[#2a1f0e]/60 text-sm uppercase tracking-[0.18em]">
            No receipts yet
          </p>
          <p className="text-xs text-[#2a1f0e]/40 mt-2 font-mono">
            The first payment through ChitBook will print here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <button
            key={entry.id.toString()}
            onClick={() => { void openReceipt(entry); }}
            className="w-full text-left bg-[#fffaf0] border-2 border-[#2a1f0e] rounded-lg shadow-[3px_3px_0_#2a1f0e] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all"
          >
            {/* slip top perforation */}
            <div
              aria-hidden
              className="h-2 opacity-25"
              style={{
                background:
                  "radial-gradient(circle at 6px -2px, transparent 5px, #2a1f0e 5px)",
                backgroundSize: "12px 100%",
                backgroundRepeat: "repeat-x",
              }}
            />
            <div className="px-5 pb-4 pt-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-[#2a1f0e] text-[#f5f0e8] px-2 py-0.5 rounded-sm font-bold">
                      CHIT #{entry.id.toString()}
                    </span>
                    {entry.timestamp !== undefined && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#2a1f0e]/50">
                        {new Date(Number(entry.timestamp) * 1000).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#2a1f0e]/60 font-mono">
                    <span>{shortAddr(entry.payer)}</span>
                    <span className="text-[#a07830] font-bold">──▶</span>
                    <span>{shortAddr(entry.payee)}</span>
                  </div>
                  <p className="font-mono text-[10px] text-[#2a1f0e]/40 break-all leading-relaxed">
                    claim {entry.claimHash.slice(0, 34)}…
                  </p>
                  {entry.memo && (
                    <p className="text-xs text-[#2a1f0e]/50 italic truncate">
                      &ldquo;{entry.memo}&rdquo;
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold tabular-nums text-2xl text-[#2a1f0e]">
                    {Amount.fromRaw(entry.amount, usdcDecimalsFor(CHAIN_ID)).toFixed(2)}
                  </p>
                  <p className="text-[10px] font-mono text-[#7a5a20] uppercase tracking-[0.2em]">
                    USDC settled
                  </p>
                  {entry.txHash && (
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, entry.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-[#a07830] hover:text-[#7a5a20] underline mt-1"
                    >
                      <ExternalLink size={9} /> tx
                    </a>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {lastFetched && (
        <p className="text-[10px] font-mono text-[#2a1f0e]/40 text-center uppercase tracking-[0.2em]">
          Ledger reads the contract directly · updated {new Date(lastFetched).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
