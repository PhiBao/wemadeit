"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBalance, useReadContract } from "wagmi";
import { useMera } from "../lib/mera-context";
import { useAppChain } from "../lib/app-chain";
import { ausdFor } from "../lib/monad";
import { erc20Abi } from "../lib/abi";
import { passkeyDisconnect, shortAddress } from "../lib/mera";
import { passkeyFaucetDrip } from "../lib/pactWrite";

// Account panel for passkey users: address to receive funds, balances, a
// testnet AUSD faucet call, and logout. Dynamic users get Dynamic's own
// panel; this is the passkey equivalent.
export default function MeraAccountModal() {
  const { meraAddr, setMeraAddr } = useMera();
  const { appChainId, chain, isMainnet } = useAppChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dripping, setDripping] = useState(false);
  const [dripMsg, setDripMsg] = useState<string | null>(null);

  const addr = meraAddr as `0x${string}` | null;
  const { data: mon } = useBalance({ address: addr ?? undefined, chainId: appChainId });
  const ausd = ausdFor(appChainId);
  const { data: ausdBal, refetch } = useReadContract({
    address: ausd ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr!],
    chainId: appChainId,
    query: { enabled: !!addr && !!ausd },
  });

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setDripMsg(null);
    }
  }, [open ]);

  if (!addr) return null;

  const copy = () => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const drip = async () => {
    setDripping(true);
    setDripMsg(null);
    try {
      await passkeyFaucetDrip(addr, appChainId);
      setDripMsg("Sent! 10,000 test AUSD on the way — refresh balances in a few seconds.");
      setTimeout(() => refetch(), 8000);
    } catch (e) {
      setDripMsg(
        e instanceof Error
          ? e.message.slice(0, 160)
          : "Faucet call failed — it may limit drips per address."
      );
    } finally {
      setDripping(false);
    }
  };

  const explorer = `${chain.blockExplorers!.default.url}/address/${addr}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Account"
        className="rounded-full bg-emerald-100 px-3 py-1 font-mono text-sm"
      >
        🍏 {shortAddress(addr)}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Your account</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 underline">
                Close
              </button>
            </div>

            <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
              <QRCodeSVG value={addr} size={160} />
            </div>

            <p className="mt-3 break-all text-center font-mono text-xs text-gray-700">{addr}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={copy}
                className="flex-1 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {copied ? "Copied ✓" : "Copy address"}
              </button>
              <a
                href={explorer}
                target="_blank"
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Explorer
              </a>
            </div>

            <div className="mt-4 grid gap-1 text-sm">
              <p>
                MON: <strong>{mon ? `${mon.formatted.slice(0, 8)}` : "…"}</strong>
              </p>
              {ausd && (
                <p>
                  AUSD:{" "}
                  <strong>
                    {ausdBal !== undefined ? `${(Number(ausdBal) / 1e6).toLocaleString()}` : "…"}
                  </strong>
                </p>
              )}
            </div>

            {isMainnet ? (
              <p className="mt-3 text-xs text-gray-600">
                To deposit, send MON or AUSD here from any wallet or exchange. AUSD is
                the dollar stablecoin — same address, same account.
              </p>
            ) : (
              <div className="mt-3">
                <button
                  onClick={drip}
                  disabled={dripping}
                  className="w-full rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {dripping ? "Requesting…" : "🚰 Get 10,000 test AUSD (faucet)"}
                </button>
                {dripMsg && <p className="mt-1 text-xs text-gray-700">{dripMsg}</p>}
              </div>
            )}

            <button
              onClick={() => {
                passkeyDisconnect();
                setMeraAddr(null);
                setOpen(false);
              }}
              className="mt-4 w-full text-sm text-gray-500 underline"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
