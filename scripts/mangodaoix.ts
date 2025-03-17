import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { BN } from '@project-serum/anchor';
import { Multidistribute } from "../target/types/multidistribute";
import { serializeInstructionToBase64 } from '@solana/spl-governance';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

async function main(): Promise<void> {
  const program = anchor.workspace.Multidistribute as Program<Multidistribute>;

  const daoWallet = new PublicKey("5tgfd6XgwiXB9otEnzFpXK11m7Q7yZUaAJzWK4oT5UGF");
  const mngoMint = new PublicKey("MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac");
  const usdtMint = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

  // Initialize collection
  console.log("Initializing collection...");
  const MAX_TOKENS = new anchor.BN("1117467621000000");
  const COUNTER = new anchor.BN(1);

  // Get collection address
  const [collection] = await PublicKey.findProgramAddress(
    [
      Buffer.from("collection"),
      daoWallet.toBuffer(),
      mngoMint.toBuffer(),
      COUNTER.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  // Get collection vault address
  const collectionVault = await getAssociatedTokenAddress(
    mngoMint,
    collection,
    true // allowOwnerOffCurve: true since collection is a PDA
  );

  // Get replacement mint address
  const [replacementMint] = await PublicKey.findProgramAddress(
    [
      Buffer.from("replacement_mint"),
      collection.toBuffer(),
    ],
    program.programId
  );

  const ix = await program.methods
    .initCollection(COUNTER, MAX_TOKENS, true)
    .accounts({
      collection,
      mint: mngoMint,
      vault: collectionVault,
      replacementMint,
      authority: daoWallet,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  console.log(await serializeInstructionToBase64(ix));


  // Initialize distribution
  console.log("Initializing distribution...");

  // Get distribution address
  const [distribution] = await PublicKey.findProgramAddress(
    [
      Buffer.from("distribution"),
      collection.toBuffer(),
      usdtMint.toBuffer(),
    ],
    program.programId
  );

  // Get distribution vault address
  const distributionVault = await getAssociatedTokenAddress(
    usdtMint,
    distribution,
    true // allowOwnerOffCurve: true since distribution is a PDA
  );

  const ix2 = await program.methods
    .initDistribution()
    .accounts({
      distribution,
      collection,
      mint: usdtMint,
      vault: distributionVault,
      authority: daoWallet,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .instruction();
  console.log(await serializeInstructionToBase64(ix2));


  const ix3 = await program.methods
    .addDistributionTokens(new anchor.BN("12465360000"))
    .accounts({
      distribution,
      vault: distributionVault,
      authorityTokenAccount: new PublicKey("5mNvRxJsBU7zAGmEjjTSvW2xCrB9PSTnZ9ZpryVv4czT"),
      authority: daoWallet,
    })
    .instruction();
  console.log(await serializeInstructionToBase64(ix3));
}

try {
  main();
} catch (error) {
  console.log(error);
}
