'use client';

import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

export const WalletButtons = () => {
    return (
        <div className="flex justify-end mb-4">
            <WalletMultiButton />
        </div>
    );
};
