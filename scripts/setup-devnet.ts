import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Multidistribute } from "../target/types/multidistribute";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  // Load environment variables
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL environment variable not set");

  const walletPath = process.env.WALLET;
  if (!walletPath) throw new Error("WALLET environment variable not set");

  // Setup connection and wallet
  const connection = new anchor.web3.Connection(rpcUrl);
  const wallet = new anchor.Wallet(
    anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    )
  );
  
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  
  anchor.setProvider(provider);
  const program = anchor.workspace.Multidistribute as Program<Multidistribute>;

  console.log("Setting up with wallet:", wallet.publicKey.toString());

  // Get or create collection mint
  let mint1: PublicKey;
  const collectionMintStr = process.env.COLLECTION_MINT;
  if (collectionMintStr) {
    console.log("Using existing collection mint:", collectionMintStr);
    mint1 = new PublicKey(collectionMintStr);
  } else {
    console.log("Creating new collection mint...");
    mint1 = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );
    console.log("Collection mint created:", mint1.toString());
  }

  // Get or create distribution mint
  let mint2: PublicKey;
  const distributionMintStr = process.env.DISTRIBUTION_MINT;
  if (distributionMintStr) {
    console.log("Using existing distribution mint:", distributionMintStr);
    mint2 = new PublicKey(distributionMintStr);
  } else {
    console.log("Creating new distribution mint...");
    mint2 = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );
    console.log("Distribution mint created:", mint2.toString());
  }

  // Create associated token accounts and mint some tokens
  console.log("Creating token accounts and minting tokens...");
  const ata1Account = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mint1,
    wallet.publicKey
  );
  const ata1 = ata1Account.address;

  await mintTo(
    connection,
    wallet.payer,
    mint1,
    ata1,
    wallet.publicKey,
    1_000_000
  );

  const ata2Account = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mint2,
    wallet.publicKey
  );
  const ata2 = ata2Account.address;

  await mintTo(
    connection,
    wallet.payer,
    mint2,
    ata2,
    wallet.publicKey,
    1_000_000
  );

  // Initialize collection
  console.log("Initializing collection...");
  const MAX_TOKENS = new anchor.BN(1000);
  const COUNTER = new anchor.BN(1);

  // Get collection address
  const [collection] = await PublicKey.findProgramAddress(
    [
      Buffer.from("collection"),
      wallet.publicKey.toBuffer(),
      mint1.toBuffer(),
      COUNTER.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  // Get collection vault address
  const collectionVault = await getAssociatedTokenAddress(
    mint1,
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

  await program.methods
    .initCollection(COUNTER, MAX_TOKENS, false)
    .accounts({
      collection,
      mint: mint1,
      vault: collectionVault,
      replacementMint,
      authority: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("Collection created:", collection.toString());

  // Initialize distribution
  console.log("Initializing distribution...");

  // Get distribution address
  const [distribution] = await PublicKey.findProgramAddress(
    [
      Buffer.from("distribution"),
      collection.toBuffer(),
      mint2.toBuffer(),
    ],
    program.programId
  );

  // Get distribution vault address
  const distributionVault = await getAssociatedTokenAddress(
    mint2,
    distribution,
    true // allowOwnerOffCurve: true since distribution is a PDA
  );

  await program.methods
    .initDistribution()
    .accounts({
      distribution,
      collection,
      mint: mint2,
      vault: distributionVault,
      authority: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Distribution created:", distribution.toString());

  // Add some initial tokens to distribution
  console.log("Adding tokens to distribution...");
  await program.methods
    .addDistributionTokens(new anchor.BN(100))
    .accounts({
      distribution,
      vault: distributionVault,
      authorityTokenAccount: ata2,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("Setup complete!");
  console.log({
    collection: collection.toString(),
    distribution: distribution.toString(),
    collectionMint: mint1.toString(),
    distributionMint: mint2.toString(),
  });
}

main().catch(console.error);
