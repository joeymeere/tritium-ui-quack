import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { getProgram } from "../source/program";
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { connection, rpc } from "../source/connection";
import {
  feeWallets,
  metadataProgram,
  sysvarInstructions,
} from "../source/consts";
import {
  findMasterEditionPda,
  findMetadataPda,
  findTokenRecordPda,
} from "@metaplex-foundation/mpl-token-metadata";
import { findAssociatedTokenPda } from "@metaplex-foundation/mpl-toolbox";
import { publicKey } from "@metaplex-foundation/umi";
import { initUmi } from "../source/utils/initUmi";
import { getRandomTokenId } from "../source/utils/getRandomTokenId";

interface SwapToTokenArgs {
  amount: number;
  sponsorPDA: string;
  tokenMint: string;
  nftMint: string;
}

/**
    -- This method swaps an NFT for tokens, denoted by the first index of the swap factor --
    @params Wallet as "NodeWallet" type, metadata with "DepositArgs" type
    @returns Transaction object with the deposit instruction
**/
export async function swapToToken(
  wallet: NodeWallet,
  metadata: SwapToTokenArgs
) {
  let { sponsorPDA, tokenMint, nftMint } = metadata;

  const umi = await initUmi(rpc as string, wallet);

  const program = await getProgram(wallet);

  let tx = new Transaction();

  let sponsor = new PublicKey(sponsorPDA);
  let tokenMintKey = new PublicKey(tokenMint);
  let nftMintKey = new PublicKey(nftMint);

  let sponsorTokenAccount = spl.getAssociatedTokenAddressSync(
    tokenMintKey,
    sponsor,
    true
  );

  let payerTokenAccount = spl.getAssociatedTokenAddressSync(
    tokenMintKey,
    wallet.publicKey
  );

  let tokenAccountInfo = await connection.getAccountInfo(sponsorTokenAccount);

  // If project token account does not exist, create an instruction and add it to the transaction
  if (!tokenAccountInfo || !tokenAccountInfo.data) {
    console.log("Creating token account...");
    await tx.add(
      await spl.createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        sponsorTokenAccount,
        sponsor,
        tokenMintKey,
        spl.TOKEN_PROGRAM_ID
      )
    );
  }

  // GET SPONSOR NFT MASTER AUTHORITY
  const [nftAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [anchor.utils.bytes.utf8.encode("nft_authority"), sponsor.toBuffer()],
    program.programId
  );

  // GET SPONSOR CUSTODY ACCOUNT
  const nftCustody = spl.getAssociatedTokenAddressSync(
    nftMintKey,
    nftAuthorityPda,
    true,
    spl.TOKEN_PROGRAM_ID,
    spl.ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // GET NFT TOKEN ACCOUNT
  /*
  const nftToken = findAssociatedTokenPda(umi, {
    mint: publicKey(nftMintKey),
    owner: publicKey(wallet.publicKey),
  });
  */

  const nftToken = spl.getAssociatedTokenAddressSync(
    nftMintKey,
    wallet.publicKey,
    true,
    spl.TOKEN_PROGRAM_ID,
    spl.ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log(
    "NFT Token",
    new anchor.web3.PublicKey(publicKey(nftToken)).toString()
  );

  // GET TOKEN RECORDS
  const sourceTokenRecord = findTokenRecordPda(umi, {
    mint: publicKey(nftMint),
    token: publicKey(nftToken),
  });

  const destinationTokenRecord = findTokenRecordPda(umi, {
    mint: publicKey(nftMint),
    token: publicKey(nftCustody),
  });

  const nftMetadata = findMetadataPda(umi, { mint: publicKey(nftMint) });
  console.log(
    "NFT Metadata",
    new anchor.web3.PublicKey(publicKey(nftMetadata)).toString()
  );

  const nftEdition = findMasterEditionPda(umi, { mint: publicKey(nftMint) });

  /*
  spl.setAuthority(

  )
  */

  let instruction = await program.methods
    .swapNftToToken()
    .accounts({
      sponsor: sponsor,
      tokenMint: tokenMintKey,
      payerTokenAccount: payerTokenAccount,
      sponsorTokenAccount: sponsorTokenAccount,
      nftToken: new anchor.web3.PublicKey(nftToken),
      nftMint: new anchor.web3.PublicKey(nftMint),
      nftMetadata: new anchor.web3.PublicKey(publicKey(nftMetadata)),
      nftAuthority: nftAuthorityPda,
      nftCustody: nftCustody,
      nftEdition: new anchor.web3.PublicKey(publicKey(nftEdition)),
      sourceTokenRecord: new PublicKey(publicKey(sourceTokenRecord)),
      destinationTokenRecord: new PublicKey(publicKey(destinationTokenRecord)),
      feeWallet: new anchor.web3.PublicKey(feeWallets[0]),
      feeWalletTwo: new anchor.web3.PublicKey(feeWallets[1]),
      feeWalletThree: new anchor.web3.PublicKey(feeWallets[2]),
      payer: wallet.publicKey,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      metadataProgram: metadataProgram,
      sysvarInstructions: sysvarInstructions,
    })
    .instruction();

  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 210_000,
  });

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 5000,
  });

  await tx.add(modifyComputeUnits, addPriorityFee, instruction);

  return tx;
}
