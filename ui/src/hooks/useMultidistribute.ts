import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, Idl, web3, BN } from '@project-serum/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getMint, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { useCallback, useEffect, useMemo, useState } from 'react';
import idl from '../idl/multidistribute.json';

export type Distribution = {
    publicKey: PublicKey;
    account: {
        collection: PublicKey;
        lifetimeDepositedTokens: number;
        mint: PublicKey;
        vault: PublicKey;
        distributedTokens: number;
        bump: number;
    };
    mint: string;
    tokenName?: string;
    decimals: number;
    userState?: {
        receivedAmount: number;
    };
};

export type CollectionWithUserState = {
    address: string;
    tokenName: string;
    lifetimeTokensCollected: number;
    maxCollectableTokens: number;
    decimals: number;
    userTokenBalance?: number;
    userState?: {
        depositedAmount: number;
    };
};

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const findCollectionUserStateAddress = (
    collectionPk: PublicKey,
    userPk: PublicKey,
    programId: PublicKey
): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('user_state'),
            collectionPk.toBuffer(),
            userPk.toBuffer()
        ],
        programId
    );
    return pda;
};

const findDistributionUserStateAddress = (
    distributionPk: PublicKey,
    userPk: PublicKey,
    programId: PublicKey
): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('distribution_user_state'),
            distributionPk.toBuffer(),
            userPk.toBuffer()
        ],
        programId
    );
    return pda;
};

const getCollectionUserState = async (
    program: Program,
    accountPk: PublicKey,
    walletPk: PublicKey
) => {
    try {
        const userStatePda = findCollectionUserStateAddress(accountPk, walletPk, program.programId);
        return await program.account.collectionUserState.fetch(userStatePda);
    } catch {
        return undefined;
    }
};

const getDistributionUserState = async (
    program: Program,
    accountPk: PublicKey,
    walletPk: PublicKey
) => {
    try {
        const userStatePda = findDistributionUserStateAddress(accountPk, walletPk, program.programId);
        return await program.account.distributionUserState.fetch(userStatePda);
    } catch {
        return undefined;
    }
};

const getTokenMetadata = async (mint: PublicKey, connection: web3.Connection): Promise<string> => {
    try {
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );
        
        const metadata = await Metadata.fromAccountAddress(connection, metadataPDA);
        return metadata.data.name.replace(/\0/g, '');
    } catch {
        return `Unknown Token (${mint.toString()})`;
    }
};

export const formatTokenAmount = (amount: number, decimals: number): string => 
    (amount / 10 ** decimals).toFixed(decimals);

export const useMultidistribute = () => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const [distributions, setDistributions] = useState<Distribution[]>([]);
    const [collection, setCollection] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const program = useMemo(() => {
        // Create a read-only provider that doesn't require a wallet
        const provider = new AnchorProvider(
            connection,
            {
                publicKey: PublicKey.default,
                signTransaction: () => Promise.reject(new Error('Wallet not connected')),
                signAllTransactions: () => Promise.reject(new Error('Wallet not connected')),
            },
            { commitment: 'confirmed' }
        );
        return new Program(idl as Idl, new PublicKey(idl.metadata.address), provider);
    }, [connection]);

    const fetchCollection = useCallback(async () => {
        if (!process.env.NEXT_PUBLIC_COLLECTION_ADDRESS) return;
        try {
            const collectionPk = new PublicKey(process.env.NEXT_PUBLIC_COLLECTION_ADDRESS);
            const collectionAccount = await program.account.collection.fetch(collectionPk);
            const tokenName = await getTokenMetadata(collectionAccount.mint, connection);
            const mintData = await getMint(connection, collectionAccount.mint);
            
            let userTokenBalance = 0;
            if (wallet?.publicKey) {
                try {
                    const userAta = getAssociatedTokenAddressSync(
                        collectionAccount.mint,
                        wallet.publicKey
                    );
                    const tokenAccount = await getAccount(connection, userAta);
                    userTokenBalance = Number(tokenAccount.amount);
                } catch (e) {
                    console.log('No token account found');
                }
            }
            
            const userState = wallet?.publicKey 
                ? await getCollectionUserState(program, collectionPk, wallet.publicKey)
                : undefined;

            setCollection({
                ...collectionAccount,
                tokenName,
                address: collectionPk.toString(),
                userState,
                userTokenBalance,
                decimals: mintData.decimals
            });
            return collectionAccount;
        } catch (e) {
            console.error('Error fetching collection:', e);
            throw e;
        }
    }, [program, wallet?.publicKey]);

    const fetchDistributions = useCallback(async (collectionPk: PublicKey) => {
        try {
            const distributions = await program.account.distribution.all([
                {
                    memcmp: {
                        offset: 8, // After discriminator
                        bytes: collectionPk.toBase58(),
                    },
                },
            ]);
            
            const distributionsWithMeta = await Promise.all(
                distributions.map(async (dist) => {
                    try {
                        const tokenName = await getTokenMetadata(dist.account.mint, connection);
                        const mintData = await getMint(connection, dist.account.mint);
                        
                        const userState = wallet?.publicKey
                            ? await getDistributionUserState(program, dist.publicKey, wallet.publicKey)
                            : undefined;

                        return {
                            ...dist,
                            tokenName,
                            mint: dist.account.mint.toString(),
                            decimals: mintData.decimals,
                            userState
                        };
                    } catch (e) {
                        console.error('Error fetching mint info:', e);
                        return {
                            ...dist,
                            tokenName: `Unknown Mint (${dist.account.mint.toString()})`,
                            mint: dist.account.mint.toString(),
                        };
                    }
                })
            );
            
            setDistributions(distributionsWithMeta);
        } catch (e) {
            console.error('Error fetching distributions:', e);
            setDistributions([]);
        }
    }, [program, connection, wallet?.publicKey]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const collectionAccount = await fetchCollection();
            if (collectionAccount) {
                await fetchDistributions(new PublicKey(process.env.NEXT_PUBLIC_COLLECTION_ADDRESS!));
            }
            setLoading(false);
        };
        load();
    }, [fetchCollection, fetchDistributions]);

    const commitTokens = useCallback(async (amount: number) => {
        if (!program) throw new Error('Program not initialized');
        if (!wallet) throw new Error('Wallet not connected');
        if (!process.env.NEXT_PUBLIC_COLLECTION_ADDRESS) throw new Error('Collection address not configured');
        
        const collectionPk = new PublicKey(process.env.NEXT_PUBLIC_COLLECTION_ADDRESS);
        
        try {
            // Get the collection's vault PDA
            const collectionAccount = await program.account.collection.fetch(collectionPk);
            
            // Get user's ATA for the collection's mint
            const userAta = getAssociatedTokenAddressSync(
                collectionAccount.mint,
                wallet.publicKey
            );

            // Get user's state PDA
            const userStatePda = findCollectionUserStateAddress(
                collectionPk,
                wallet.publicKey,
                program.programId
            );

            // Get user's replacement token ATA
            const userReplacementAta = getAssociatedTokenAddressSync(
                collectionAccount.replacementMint,
                wallet.publicKey
            );

            const tx = await program.methods
                .userCommitToCollection(new BN(amount))
                .accounts({
                    collection: collectionPk,
                    userState: userStatePda,
                    mint: collectionAccount.mint,
                    userTokenAccount: userAta,
                    vault: collectionAccount.vault,
                    replacementMint: collectionAccount.replacementMint,
                    userReplacementTokenAccount: userReplacementAta,
                    user: wallet.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: web3.SYSVAR_RENT_PUBKEY,
                })
                .transaction();

            const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
            const signature = await provider.sendAndConfirm(tx);
            // Refresh data
            await fetchCollection();
            await fetchDistributions(collectionPk);
            
        } catch (error) {
            console.error('Error committing tokens:', error);
            throw error;
        }
    }, [program, wallet, connection, fetchCollection, fetchDistributions]);

    const calculateClaimableAmount = useCallback((distribution: Distribution) => {
        if (!collection || !distribution) return 0;
        
        // Calculate user's total share using the same formula as the program
        const userShare = Math.floor(
            (distribution.account.lifetimeDepositedTokens * collection.userState?.depositedAmount) / 
            collection.maxCollectableTokens
        );
        
        // Subtract what they've already received
        return Math.max(0, userShare - (distribution.userState?.receivedAmount || 0));
    }, [collection]);

    const claimFromDistribution = useCallback(async (distributionAddress: string) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        if (!process.env.NEXT_PUBLIC_COLLECTION_ADDRESS) throw new Error('Collection address not configured');
        
        const collectionPk = new PublicKey(process.env.NEXT_PUBLIC_COLLECTION_ADDRESS);
        const distributionPk = new PublicKey(distributionAddress);
        
        try {
            // Get the distribution account to access its data
            const distributionAccount = await program.account.distribution.fetch(distributionPk);
            
            // Get user states PDAs
            const collectionUserStatePda = findCollectionUserStateAddress(
                collectionPk,
                wallet.publicKey,
                program.programId
            );
            
            const distributionUserStatePda = findDistributionUserStateAddress(
                distributionPk,
                wallet.publicKey,
                program.programId
            );

            // Get user's ATA for the distribution's mint
            const userTokenAccount = getAssociatedTokenAddressSync(
                distributionAccount.mint,
                wallet.publicKey
            );

            const tx = await program.methods
                .userClaimFromDistribution()
                .accounts({
                    collection: collectionPk,
                    distribution: distributionPk,
                    collectionUserState: collectionUserStatePda,
                    distributionUserState: distributionUserStatePda,
                    distributionVault: distributionAccount.vault,
                    userTokenAccount: userTokenAccount,
                    user: wallet.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .transaction();

            const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
            const signature = await provider.sendAndConfirm(tx);

            // Refresh data
            await fetchCollection();
            await fetchDistributions(collectionPk);
            
        } catch (error) {
            console.error('Error claiming from distribution:', error);
            throw error;
        }
    }, [program, wallet, connection, fetchCollection, fetchDistributions]);

    return {
        program,
        commitTokens,
        claimFromDistribution,
        calculateClaimableAmount,
        distributions,
        collection,
        loading
    };
};
