import { useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, keccak256, toBytes } from "viem";
import { CHITBOOK_ADDRESS, CHITBOOK_ABI, type ChitReceipt } from "@/lib/chitbook";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { Search, CheckCircle } from "lucide-react";

const CHAIN_ID = 5042002;
const LOOKBACK = 100000n; // scan a wider window for verify

interface Props {
  onSelectReceipt: (receipt: ChitReceipt, txHash?: `0x${string}`) => void;
}

type QueryMode = "id" | "claimHash" | "txHash";

function detectMode(input: string): QueryMode {
  const t = input.trim();
  // 66-char hex = tx hash or bytes32 claim hash — distinguish by context
  if (/^\d+$/.test(t)) return "id";
  if (t.startsWith("0x") && t.length === 66) {
    // Could be claimHash or txHash — we'll try both
    return "txHash"; // txHash first, fallback to claimHash
  }
  // Plain text = compute keccak256 as claim hash
  return "claimHash";
}

export default function VerifyScreen({ onSelectReceipt }: Props) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ receipt: ChitReceipt; txHash?: `0x${string}` } | null>(null);

  async function handleVerify() {
    if (!CHITBOOK_ADDRESS || !client || !input.trim()) return;
    setLoading(true);
    setError(null);
    setFound(null);

    try {
      const t = input.trim();
      const mode = detectMode(t);

      // --- By chit number (id) ---
      if (mode === "id") {
        const id = BigInt(t);
        const raw = await client.readContract({
          address: CHITBOOK_ADDRESS,
          abi: CHITBOOK_ABI,
          functionName: "getReceipt",
          args: [id],
        });
        setFound({ receipt: raw });
        return;
      }

      // --- By tx hash ---
      if (mode === "txHash") {
        const txHash = t as `0x${string}`;
        try {
          const receipt = await client.getTransactionReceipt({ hash: txHash });
          if (receipt) {
            // Find the ReceiptIssued log
            const log = receipt.logs.find(
              (l) => l.address?.toLowerCase() === CHITBOOK_ADDRESS?.toLowerCase()
            );
            if (log?.topics[1]) {
              const id = BigInt(log.topics[1]);
              const raw = await client.readContract({
                address: CHITBOOK_ADDRESS,
                abi: CHITBOOK_ABI,
                functionName: "getReceipt",
                args: [id],
              });
              setFound({ receipt: raw, txHash });
              return;
            }
          }
        } catch {
          // Not a tx hash — fall through to try as claim hash
        }

        // Try as a bytes32 claimHash via events
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
        const match = logs.find((l) => l.args.claimHash === t);
        if (match && match.args.id) {
          const raw = await client.readContract({
            address: CHITBOOK_ADDRESS,
            abi: CHITBOOK_ABI,
            functionName: "getReceipt",
            args: [match.args.id],
          });
          setFound({ receipt: raw, txHash: match.transactionHash ?? undefined });
          return;
        }

        setError("No receipt found for that hash. Try the chit number instead.");
        return;
      }

      // --- By claim reference text (keccak256 it then scan events) ---
      const claimHash = keccak256(toBytes(t));
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
      const match = logs.find((l) => l.args.claimHash === claimHash);
      if (match && match.args.id) {
        const raw = await client.readContract({
          address: CHITBOOK_ADDRESS,
          abi: CHITBOOK_ABI,
          functionName: "getReceipt",
          args: [match.args.id],
        });
        setFound({ receipt: raw, txHash: match.transactionHash ?? undefined });
        return;
      }
      setError(`No receipt found with claim hash ${claimHash}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("InvalidReceiptId")) {
        setError("No receipt found with that ID.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    if (found) onSelectReceipt(found.receipt, found.txHash);
  }

  const placeholder = "Chit # · 0x claim hash · 0x tx hash · plain claim ref";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-[#2a1f0e] tracking-tight">Verify</h1>
        <p className="text-sm text-[#2a1f0e]/50 mt-1">
          Prove settlement by looking up any receipt.
        </p>
      </div>

      {!CHITBOOK_ADDRESS && (
        <div className="bg-[#a07830]/10 border border-[#a07830]/30 rounded-xl p-4 text-sm text-[#a07830] font-mono">
          Contract not deployed yet.
        </div>
      )}

      <div className="bg-white/80 border border-[#2a1f0e]/10 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-[#2a1f0e] px-5 py-3">
          <span className="font-mono text-[#f5f0e8]/60 text-xs uppercase tracking-[0.14em]">
            Settlement Proof
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 mb-1.5">
              Lookup
            </label>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null); setFound(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { void handleVerify(); } }}
                placeholder={placeholder}
                disabled={loading}
                className="flex-1 font-mono text-sm bg-[#f5f0e8] border border-[#2a1f0e]/15 rounded-lg px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/20 focus:outline-none focus:ring-2 focus:ring-[#a07830]/40 disabled:opacity-50"
              />
              <button
                onClick={() => { void handleVerify(); }}
                disabled={loading || !input.trim() || !CHITBOOK_ADDRESS}
                className="bg-[#2a1f0e] text-[#f5f0e8] px-4 py-2.5 rounded-lg font-mono text-sm hover:bg-[#2a1f0e]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <Search size={14} />
                )}
                {loading ? "…" : "Verify"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Chit #", "Claim ref text", "0x claimHash", "0x txHash"].map((hint) => (
                <span
                  key={hint}
                  className="text-[9px] font-mono uppercase tracking-wider bg-[#2a1f0e]/5 text-[#2a1f0e]/40 px-2 py-0.5 rounded"
                >
                  {hint}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-mono">
              {error}
            </div>
          )}

          {found && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                <span className="font-mono text-sm font-bold text-emerald-700 uppercase tracking-wider">
                  Receipt #{found.receipt.id.toString()} verified
                </span>
              </div>
              <div className="font-mono text-xs text-emerald-600 space-y-0.5">
                <p>Payer: {found.receipt.payer}</p>
                <p>Payee: {found.receipt.payee}</p>
                <p>
                  Amount: {(Number(found.receipt.amount) / 1e6).toFixed(6)} USDC
                </p>
                <p className="break-all">claimHash: {found.receipt.claimHash}</p>
              </div>
              {found.txHash && (
                <a
                  href={buildTxExplorerUrl(CHAIN_ID, found.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-emerald-600 hover:text-emerald-700 underline break-all block"
                >
                  {found.txHash}
                </a>
              )}
              <button
                onClick={handleOpen}
                className="w-full bg-[#2a1f0e] text-[#f5f0e8] py-2 rounded-lg font-mono text-xs uppercase tracking-wider hover:bg-[#2a1f0e]/80 transition-colors"
              >
                Open Full Receipt
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className="bg-[#2a1f0e]/4 rounded-xl p-4 space-y-2 font-mono text-[10px] text-[#2a1f0e]/40">
        <p className="uppercase tracking-wider text-[9px] text-[#2a1f0e]/25">How it works</p>
        <p>Enter a chit number, the original claim reference text, its keccak256 hash, or a transaction hash. All routes resolve to the same onchain record.</p>
      </div>
    </div>
  );
}
