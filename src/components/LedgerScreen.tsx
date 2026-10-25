import { useEffect, useState, useCallback, useRef } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { Amount, usdcDecimalsFor } from "@/onchain-money";
import { CHITBOOK_ADDRESS, CHITBOOK_ABI, type ChitReceipt } from "@/lib/chitbook";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { ExternalLink, RefreshCw } from "lucide-react";

const CHAIN_ID = 5042002;
const LOOKBACK = 2000n; // recent blocks only

interface LedgerEntry {
  id: bigint;
  payer: `0x${string}`;
  payee: `0x${string}`;
  amount: bigint;
  claimHash: `0x${string}`;
  memo: string;
  txHash?: `0x${string}`;
  blockNumber?: bigint;
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
      const head = await client.getBlockNumber();
      const fromBlock = head > LOOKBACK ? head - LOOKBACK : 0n;
      const logs = await client.getLogs({
        address: CHITBOOK_ADDRESS,
        event: parseAbiItem(
          "event ReceiptIssued(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, bytes32 claimHash, string memo)"
        ),
        fromBlock,
        toBlock: head,
      });
      const parsed: LedgerEntry[] = logs
        .slice()
        .reverse()
        .map((log) => ({
          id: log.args.id ?? 0n,
          payer: log.args.payer ?? ("0x"),
          payee: log.args.payee ?? ("0x"),
          amount: log.args.amount ?? 0n,
          claimHash: log.args.claimHash ?? ("0x"),
          memo: log.args.memo ?? "",
          txHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ?? undefined,
        }));
      setEntries(parsed);
      setLastFetched(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Auto-load on mount and when client changes. Using a ref to avoid re-firing
  // on every re-render while keeping the linter happy about setState in effects.
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
        address: CHITBOOK_ADDRESS,
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
      <div className="bg-[#a07830]/10 border border-[#a07830]/30 rounded-xl p-6 text-sm text-[#a07830] font-mono text-center">
        Contract not deployed yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#2a1f0e] tracking-tight">Ledger</h1>
          <p className="text-sm text-[#2a1f0e]/50 mt-0.5">Recent receipt events</p>
        </div>
        <button
          onClick={() => { void fetchLedger(); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 hover:text-[#2a1f0e] border border-[#2a1f0e]/15 px-3 py-2 rounded-lg hover:bg-[#2a1f0e]/5 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono">
          {error}
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/60 border border-[#2a1f0e]/8 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <div className="border-2 border-dashed border-[#2a1f0e]/12 rounded-xl p-12 text-center">
          <p className="font-mono text-[#2a1f0e]/30 text-sm uppercase tracking-wider">
            No receipts yet
          </p>
          <p className="text-xs text-[#2a1f0e]/20 mt-1">Issue a chit to see it here.</p>
        </div>
      )}

      <div className="space-y-2">
        {entries.map((entry) => (
          <button
            key={entry.id.toString()}
            onClick={() => { void openReceipt(entry); }}
            className="w-full text-left bg-white/80 hover:bg-white border border-[#2a1f0e]/10 hover:border-[#a07830]/30 rounded-xl px-5 py-4 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-[#2a1f0e] text-[#f5f0e8] px-2 py-0.5 rounded">
                    #{entry.id.toString()}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#2a1f0e]/40 truncate">
                    {entry.claimHash.slice(0, 18)}…
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#2a1f0e]/50 font-mono">
                  <span>{shortAddr(entry.payer)}</span>
                  <span className="text-[#a07830]">→</span>
                  <span>{shortAddr(entry.payee)}</span>
                </div>
                {entry.memo && (
                  <p className="text-xs text-[#2a1f0e]/40 italic truncate">
                    &ldquo;{entry.memo}&rdquo;
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="font-mono font-bold tabular-nums text-[#2a1f0e]">
                  {Amount.fromRaw(entry.amount, usdcDecimalsFor(CHAIN_ID)).toFixed(2)}
                </p>
                <p className="text-[10px] font-mono text-[#a07830] uppercase tracking-wider">USDC</p>
                {entry.txHash && (
                  <a
                    href={buildTxExplorerUrl(CHAIN_ID, entry.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-0.5 text-[10px] text-[#2a1f0e]/30 hover:text-[#a07830] transition-colors"
                  >
                    <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {lastFetched && (
        <p className="text-[10px] font-mono text-[#2a1f0e]/25 text-center uppercase tracking-wider">
          Last updated {new Date(lastFetched).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
