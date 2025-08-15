import { task } from "hardhat/config"
import { deriveConnection } from "."
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import { types as devtoolsTypes } from "@layerzerolabs/devtools-evm-hardhat"
import { fetchMint } from "@metaplex-foundation/mpl-toolbox"
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters"
import { parseDecimalToUnits } from "./utils"

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
)

task("mint-with-memo", "Mint a token with a memo")
  .addParam("mint", "The mint address of the token")
  .addParam("to", "The address to mint the tokens to")
  .addParam("amount", "The amount of tokens to mint")
  .addParam("data", "The data to include in the memo instruction")
  .addParam("eid", "The endpoint ID")
  .addOptionalParam(
    "tokenProgram",
    "The token program ID",
    TOKEN_PROGRAM_ID.toBase58(),
    devtoolsTypes.string
  )
  .setAction(async ({ amount, data, eid, to, mint, tokenProgram }, hre) => {
    const { connection, umi, umiWalletKeyPair } = await deriveConnection(eid)

    // This is the keypair for the account that will pay for fees and act as the mint authority
    const signer = Keypair.fromSecretKey(umiWalletKeyPair.secretKey)

    const mintPublicKey = new PublicKey(mint)
    const destinationWallet = new PublicKey(to)
    const tokenProgramId = tokenProgram
      ? new PublicKey(tokenProgram)
      : TOKEN_PROGRAM_ID

    // The destination for minting is not the user's wallet, but their Associated Token Account (ATA).
    const associatedTokenAccountAddress = getAssociatedTokenAddressSync(
      mintPublicKey,
      destinationWallet,
      false,
      tokenProgramId
    )

    const mintInfo = await fetchMint(umi, fromWeb3JsPublicKey(mintPublicKey))
    const parsedAmount = parseDecimalToUnits(amount, mintInfo.decimals)

    const transaction = new Transaction()

    // We need to check if the destination ATA exists. If not, we must create it first.
    // const ataInfo = await connection.getAccountInfo(
    // associatedTokenAccountAddress
    // )
    // if (!ataInfo) {
    //   console.log(
    //     `Destination token account ${associatedTokenAccountAddress.toBase58()} does not exist. Creating it...`
    //   )
    //   transaction.add(
    //     createAssociatedTokenAccountInstruction(
    //       signer.publicKey, // Payer
    //       associatedTokenAccountAddress, // ATA Address to create
    //       destinationWallet, // Owner of the ATA
    //       mintPublicKey, // Mint
    //       tokenProgramId
    //     )
    //   )
    // }

    // Now we can create the instruction to mint to the ATA
    transaction.add(
      createMintToInstruction(
        mintPublicKey,
        associatedTokenAccountAddress,
        new PublicKey((mintInfo.mintAuthority as any).value), // The mint authority is the signer's public key
        parsedAmount,
        [signer.publicKey], // This should be empty if the mint authority is a single account
        tokenProgramId
      )
    )

    // Finally, add the memo instruction
    transaction.add(createMemoInstruction(data))

    // Send the transaction, signed by the fee payer/mint authority
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      signer,
    ])

    console.log(`Transaction sent: ${signature}`)
  })

function createMemoInstruction(
  memo: string,
  signerPubkeys?: Array<PublicKey>
): TransactionInstruction {
  const keys =
    signerPubkeys == null
      ? []
      : signerPubkeys.map(function (key) {
          return { pubkey: key, isSigner: true, isWritable: false }
        })

  return new TransactionInstruction({
    keys: keys,
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  })
}
