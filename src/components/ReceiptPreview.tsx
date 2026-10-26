import { keccak256, toBytes } from "viem";

interface Props {
  payee: string;
  amount: string;
  claimRef: string;
  memo: string;
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 11) return "0x0000…0000";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Live preview of the receipt slip the current form values will mint.
 * Updates as you type — the product's artifact, on screen before you pay.
 */
export default function ReceiptPreview({ payee, amount, claimRef, memo }: Props) {
  const hash = claimRef.trim() ? keccak256(toBytes(claimRef.trim())) : null;

  return (
    <div className="bg-[#fffaf0] border-2 border-[#2a1f0e] rounded-lg shadow-[4px_4px_0_#2a1f0e] overflow-hidden">
      {/* perforated tear edge */}
      <div
        aria-hidden
        className="h-3 bg-[#f5f0e8]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 7px 8px, #f5f0e8 5px, transparent 5px), radial-gradient(circle at 7px 8px, #2a1f0e 5px, transparent 5px)",
          backgroundSize: "14px 16px",
          backgroundPosition: "0 0, 0 1px",
        }}
      />
      <div className="px-5 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#2a1f0e]/50">
            Chit · receipt preview
          </span>
          <span className="text-[10px] font-mono text-[#a07830] border border-[#a07830]/50 rounded-sm px-1.5 py-0.5 uppercase tracking-wider">
            settles on Arc
          </span>
        </div>

        <div className="text-center">
          <p className="font-serif text-4xl font-bold text-[#2a1f0e] tabular-nums leading-none">
            {amount && Number(amount) > 0 ? Number(amount).toFixed(2) : "0.00"}
          </p>
          <p className="text-[10px] font-mono text-[#7a5a20] uppercase tracking-[0.3em] mt-1">
            USDC
          </p>
        </div>

        <div className="border-t-2 border-dashed border-[#2a1f0e]/25" />

        <dl className="space-y-2 text-xs font-mono">
          <div className="flex justify-between gap-3">
            <dt className="text-[#2a1f0e]/50 uppercase tracking-wider">To</dt>
            <dd className="text-[#2a1f0e] truncate">{shortAddr(payee)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#2a1f0e]/50 uppercase tracking-wider">Claim</dt>
            <dd className="text-[#2a1f0e] truncate">
              {claimRef.trim() || <span className="text-[#2a1f0e]/30">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[#2a1f0e]/50 uppercase tracking-wider mb-0.5">Claim hash</dt>
            <dd className="text-[10px] text-[#2a1f0e]/60 break-all leading-relaxed">
              {hash ?? <span className="text-[#2a1f0e]/25">keccak256 of your claim reference</span>}
            </dd>
          </div>
          {memo.trim() && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#2a1f0e]/50 uppercase tracking-wider">Memo</dt>
              <dd className="text-[#2a1f0e]/70 italic truncate">&ldquo;{memo.trim()}&rdquo;</dd>
            </div>
          )}
        </dl>

        <div className="border-t-2 border-dashed border-[#2a1f0e]/25" />

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-[#2a1f0e]/40 uppercase tracking-[0.18em]">
            Verifiable by anyone · one curl
          </span>
          <span
            aria-hidden
            className="inline-block w-8 h-8 rounded-full border-2 border-[#a07830] flex items-center justify-center"
          >
            <span className="block w-3 h-3 rounded-full bg-[#f5b83d]" />
          </span>
        </div>
      </div>
    </div>
  );
}
