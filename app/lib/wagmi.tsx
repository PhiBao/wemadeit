"use client";

import { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import { DynamicContextProvider, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { monadMainnet, monadTestnet } from "./monad";
import { MeraProvider } from "./mera-context";
import { AppChainProvider } from "./app-chain";

// The app mounts a lot of chain reads at once (your pots + the public feed).
// Default react-query settings refetch every one of them on every window focus
// change, which produced a burst of parallel requests and HTTP 429 from the RPC.
// Focus-refetch is also pointless here: pot data is polled on an interval, and
// a returning visitor gains nothing from re-reading on tab switch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Back off on rate limits instead of hammering the endpoint.
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 429) return failureCount < 2;
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

// Both Monad chains are registered so the in-app network switcher works;
// activeChain() (env-driven) decides defaults, factory, and indexer bounds.
export const wagmiConfig = createConfig({
  chains: [monadMainnet, monadTestnet],
  connectors: [injected()],
  multiInjectedProviderDiscovery: false,
  // wagmi 2.16 types http() as string-only, so transport-level retry is not
  // configurable here. Rate-limit backoff lives in the QueryClient above, which
  // is the layer every chain read in this app goes through.
  transports: {
    [monadMainnet.id]: http(),
    [monadTestnet.id]: http(),
  },
});

export const dynamicEnabled = !!process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;

function Core({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MeraProvider>
          <AppChainProvider>{children}</AppChainProvider>
        </MeraProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  // Without an env ID (e.g. CI), run plain wagmi so nothing breaks.
  if (!dynamicEnabled) return <Core>{children}</Core>;

  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID!,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <Core>
        <DynamicWagmiConnector>
          {children}
          {/* Mounted once as the host for the built-in profile/account modal
              (opened via setShowDynamicUserProfile). The trigger button is
              hidden — our own header cluster is the visible UI; the modal
              itself portals to document.body. */}
          <span style={{ display: "none" }} aria-hidden>
            <DynamicWidget />
          </span>
        </DynamicWagmiConnector>
      </Core>
    </DynamicContextProvider>
  );
}
