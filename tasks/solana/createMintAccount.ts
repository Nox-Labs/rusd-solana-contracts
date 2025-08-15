import { EndpointId } from "@layerzerolabs/lz-definitions"
import { task } from "hardhat/config"
import { deriveConnection, getExplorerTxLink } from "."
import { assertAccountInitialized } from "@layerzerolabs/devtools-solana"
import { createSignerFromKeypair } from "@metaplex-foundation/umi"
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters"
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"
import { createMint } from "@metaplex-foundation/mpl-toolbox"

interface CreateMintAccountTaskArgs {
  eid: EndpointId
}

task("create-mint-account", "Creates a new mint account")
  .addParam("eid", "Endpoint ID")
  .setAction(async ({ eid }: CreateMintAccountTaskArgs) => {
    const { connection, umi, umiWalletKeyPair } = await deriveConnection(eid)

    const mintKeypair = umi.eddsa.generateKeypair()
    const mintSigner = createSignerFromKeypair(umi, mintKeypair)

    const txBuilder = createMint(umi, {
      mint: mintSigner,
      mintAuthority: umiWalletKeyPair.publicKey,
      freezeAuthority: umiWalletKeyPair.publicKey,
      decimals: 6,
    })

    const tx = await txBuilder.sendAndConfirm(umi)
    await assertAccountInitialized(
      connection,
      toWeb3JsPublicKey(mintKeypair.publicKey)
    )
    console.log(
      `Mint account created: ${toWeb3JsPublicKey(mintKeypair.publicKey).toBase58()}`
    )
    console.log(
      `Transaction: ${getExplorerTxLink(bs58.encode(tx.signature), eid === EndpointId.SOLANA_V2_TESTNET)}`
    )
  })
