'use client';

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { StarknetConfig, starkscan } from "@starknet-react/core";
import { Header } from "~~/components/Header";
import { CavosProvider } from '@cavos/react';

import { appChains, connectors } from "~~/services/web3/connectors";
import provider from "~~/services/web3/provider";
import { useNativeCurrencyPrice } from "~~/hooks/scaffold-stark/useNativeCurrencyPrice";

const Footer = dynamic(
  () => import("~~/components/Footer").then((mod) => mod.Footer),
  { ssr: false }
);

const ScaffoldStarkApp = ({ children }: { children: React.ReactNode }) => {
  useNativeCurrencyPrice();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  return (
    <>
      <div className="flex relative flex-col min-h-screen bg-main">
        {isDarkMode ? (
          <>
            <div className="circle-gradient-dark w-[330px] h-[330px]"></div>
            <div className="circle-gradient-blue-dark w-[330px] h-[330px]"></div>
          </>
        ) : (
          <>
            <div className="circle-gradient w-[330px] h-[330px]"></div>
            <div className="circle-gradient-blue w-[330px] h-[630px]"></div>
          </>
        )}
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const ScaffoldStarkAppWithProviders = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const cavosConfig = {
    appId: 'd3a4a051-795d-47ea-994e-8aaf9626e335',
    paymasterApiKey: 'cav_TqWxZa2kpUGed304VKEPTKAT30txunyatMOyH4hCTtSnHMyL',
    network: 'sepolia' as const,
    session: {
      defaultPolicy: {
        allowedContracts: [
          '0x74694c150c1b9ff90573c6d856d29cbd1ab3d55252abd4ef4c9827c28482743', // Nuevo contrato de subasta
          '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // STRK token
        ],
        spendingLimits: [
          {
            token: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
            limit: 1000n * 10n ** 18n,
          },
        ],
        maxCallsPerTx: 10,
      },
    },
    enableLogging: process.env.NODE_ENV === 'development',
  };

  return (
    <CavosProvider config={cavosConfig}>
      <StarknetConfig
        chains={appChains}
        provider={provider}
        connectors={connectors}
        explorer={starkscan}
      >
        <ScaffoldStarkApp>{children}</ScaffoldStarkApp>
      </StarknetConfig>
    </CavosProvider>
  );
};