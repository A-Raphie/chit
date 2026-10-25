import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import PayScreen from "./components/PayScreen";
import LedgerScreen from "./components/LedgerScreen";
import VerifyScreen from "./components/VerifyScreen";
import ReceiptView from "./components/ReceiptView";
import type { ChitReceipt } from "./lib/chitbook";

type Screen =
  | { id: "pay" }
  | { id: "ledger" }
  | { id: "verify" }
  | { id: "receipt"; receipt: ChitReceipt; txHash?: `0x${string}`; claimRef?: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: "pay" });

  function showReceipt(receipt: ChitReceipt, txHash?: `0x${string}`, claimRef?: string) {
    setScreen({ id: "receipt", receipt, txHash, claimRef });
  }

  const nav = (id: "pay" | "ledger" | "verify") => () => setScreen({ id });

  return (
    <div className="min-h-dvh bg-[#f5f0e8] font-sans">
      {/* Top bar */}
      <header className="border-b border-[#2a1f0e]/10 bg-[#f5f0e8]/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={nav("pay")}
            className="flex items-center gap-2 group"
          >
            <span className="text-[#2a1f0e] font-serif text-xl font-bold tracking-tight group-hover:opacity-70 transition-opacity">
              Chit
            </span>
            <span className="text-[10px] font-mono text-[#a07830] uppercase tracking-[0.12em] bg-[#a07830]/10 px-1.5 py-0.5 rounded">
              Receipt Layer
            </span>
          </button>

          <div className="flex items-center gap-3">
            <nav className="hidden sm:flex items-center gap-1">
              {(["pay", "ledger", "verify"] as const).map((id) => (
                <button
                  key={id}
                  onClick={nav(id)}
                  className={`px-3 py-1.5 rounded text-sm font-mono uppercase tracking-wider transition-colors ${
                    screen.id === id
                      ? "bg-[#2a1f0e] text-[#f5f0e8]"
                      : "text-[#2a1f0e]/60 hover:text-[#2a1f0e] hover:bg-[#2a1f0e]/5"
                  }`}
                >
                  {id}
                </button>
              ))}
            </nav>
            <ConnectKitButton />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex border-t border-[#2a1f0e]/10">
          {(["pay", "ledger", "verify"] as const).map((id) => (
            <button
              key={id}
              onClick={nav(id)}
              className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                screen.id === id
                  ? "bg-[#2a1f0e] text-[#f5f0e8]"
                  : "text-[#2a1f0e]/60"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {screen.id === "pay" && (
          <PayScreen onReceiptIssued={showReceipt} />
        )}
        {screen.id === "ledger" && (
          <LedgerScreen onSelectReceipt={showReceipt} />
        )}
        {screen.id === "verify" && (
          <VerifyScreen onSelectReceipt={showReceipt} />
        )}
        {screen.id === "receipt" && (
          <ReceiptView
            receipt={screen.receipt}
            txHash={screen.txHash}
            claimRef={screen.claimRef}
            onBack={() => setScreen({ id: "pay" })}
          />
        )}
      </main>
    </div>
  );
}
