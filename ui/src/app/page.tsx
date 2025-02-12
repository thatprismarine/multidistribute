'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useMultidistribute, formatTokenAmount } from '@/hooks/useMultidistribute';
import { useState } from 'react';
import { Card } from '@/components/Card';
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder';

export default function Home() {
  const { connected } = useWallet();
  const { commitTokens, claimFromDistribution, calculateClaimableAmount, distributions, collection, loading: dataLoading } = useMultidistribute();
  const [amount, setAmount] = useState('0');
  const [loading, setLoading] = useState(false);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    
    setLoading(true);
    try {
      await commitTokens(Number(amount));
      setAmount('');
    } catch (error) {
      console.error('Error committing tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card title="Collection">
            {dataLoading ? (
              <LoadingPlaceholder text="Loading collection data..." />
            ) : collection ? (
              <div className="space-y-4">
                <div className="space-y-0">
                  <div className="font-mono text-sm mb-2">Address: {collection.address}</div>
                  <div>Token: {collection.tokenName}</div>
                  <div>Total Collected: {formatTokenAmount(collection.lifetimeTokensCollected, collection.decimals)}</div>
                  <div>Max Collectable: {formatTokenAmount(collection.maxCollectableTokens, collection.decimals)}</div>
                </div>
                
                {connected && (
                  <div className="pt-4 border-t space-y-4">
                    <div className="space-y-0">
                      <div>Your Contribution: {formatTokenAmount(collection?.userState?.depositedAmount || 0, collection.decimals)} tokens</div>
                    </div>
                    <form onSubmit={handleCommit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Commit Additional Tokens: {formatTokenAmount(Number(amount), collection.decimals)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max={Math.min(
                            collection.userTokenBalance || 0,
                            collection.maxCollectableTokens - collection.lifetimeTokensCollected
                          )}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full"
                          disabled={loading || !collection.userTokenBalance}
                        />
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{formatTokenAmount(0, collection.decimals)}</span>
                          <span>{formatTokenAmount(
                            Math.min(
                              collection.userTokenBalance || 0,
                              collection.maxCollectableTokens - collection.lifetimeTokensCollected
                            ),
                            collection.decimals
                          )}</span>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={loading || amount === '0'}
                        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {loading ? 'Processing...' : 'Commit Tokens (this action is final!)'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div>Collection not found</div>
            )}
      </Card>

      <Card title="Distributions">
            {dataLoading ? (
              <LoadingPlaceholder text="Loading distributions..." />
            ) : distributions.length > 0 ? (
              <div className="space-y-4">
                {distributions.map((dist) => (
                  <div key={dist.publicKey.toString()} className="p-4 border rounded-lg space-y-4">
                    <div className="space-y-0">
                      <div className="font-mono text-sm mb-2">
                        Address: {dist.publicKey.toString()}
                      </div>
                      <div>Token: {dist.tokenName}</div>
                      <div>Total Deposited: {formatTokenAmount(dist.account.lifetimeDepositedTokens, dist.decimals)}</div>
                      <div>Total Distributed: {formatTokenAmount(dist.account.distributedTokens, dist.decimals)}</div>
                    </div>
                    {connected && (
                      <div className="pt-4 border-t space-y-0">
                        <div>Your Claimed Amount: {formatTokenAmount(dist.userState?.receivedAmount || 0, dist.decimals)} tokens</div>
                        <div>Available to claim: {formatTokenAmount(calculateClaimableAmount(dist), dist.decimals)} tokens</div>
                        <button
                          onClick={() => claimFromDistribution(dist.publicKey.toString())}
                          disabled={calculateClaimableAmount(dist) == 0}
                          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Claim {formatTokenAmount(calculateClaimableAmount(dist), dist.decimals)} tokens
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div>No distributions available</div>
            )}
      </Card>
    </div>
  );
}
