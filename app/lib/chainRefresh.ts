"use client";

// After any confirmed transaction the UI must re-read the chain. Several reads
// here were written without a refetch trigger: the AUSD balance in the account
// sheet had no refetchInterval at all and only refreshed after a faucet drip, so
// committing an AUSD pot left the panel showing the pre-commit balance forever.
//
// Polling alone is not enough either — it leaves a window where the UI claims
// "confirmed" while showing stale numbers. Invalidating on receipt closes that
// window immediately.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** wagmi query-key roots that represent on-chain state we display. */
const CHAIN_READS = new Set([
  "readContract",
  "readContracts",
  "getBalance",
  "getTokenBalance",
  "getBlockNumber",
  "getTransactionReceipt",
  "getTransactionCount",
]);

export function useChainRefresh() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && CHAIN_READS.has(q.queryKey[0]),
    });
  }, [queryClient]);
}