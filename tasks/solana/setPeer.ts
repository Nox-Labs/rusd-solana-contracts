import assert from "assert"

import { mplToolbox } from "@metaplex-foundation/mpl-toolbox"
import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import {
  fromWeb3JsKeypair,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters"
import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import bs58 from "bs58"
import { task } from "hardhat/config"

import { types } from "@layerzerolabs/devtools-evm-hardhat"
import { deserializeTransactionMessage } from "@layerzerolabs/devtools-solana"
import { EndpointId } from "@layerzerolabs/lz-definitions"
import { OftPDA, oft } from "@layerzerolabs/oft-v2-solana-sdk"
import { createOFTFactory } from "@layerzerolabs/ua-devtools-solana"
import { deriveConnection, getExplorerTxLink } from "."

import { createSolanaConnectionFactory } from "../common/utils"

interface Args {
  eid: EndpointId
  programId: string
  oftStore: string
  peerEid: EndpointId
  peerAddress: string
}

task(
  "lz:oft:solana:set-peer",
  "Sets the Solana and EVM rate limits from './scripts/solana/utils/constants.ts'"
)
  .addParam("programId", "The OFT Program id")
  .addParam(
    "eid",
    "Solana mainnet (30168) or testnet (40168)",
    undefined,
    types.eid
  )
  .addParam("peerEid", "The peer endpoint ID", undefined, types.eid)
  .addParam("oftStore", "The OFTStore account")
  .addParam("peerAddress", "The peer address")
  .setAction(async (taskArgs: Args, hre) => {
    console.log("taskArgs", taskArgs)

    const { connection, umi, umiWalletKeyPair, umiWalletSigner } =
      await deriveConnection(taskArgs.eid)

    const keypair = Keypair.fromSecretKey(umiWalletKeyPair.secretKey)

    const connectionFactory = createSolanaConnectionFactory()
    const solanaSdkFactory = createOFTFactory(
      () => toWeb3JsPublicKey(umiWalletSigner.publicKey),
      () => new PublicKey(taskArgs.programId),
      connectionFactory
    )
    const sdk = await solanaSdkFactory({
      address: new PublicKey(taskArgs.oftStore).toBase58(),
      eid: taskArgs.eid,
    })

    const paddedPeerAddress = Buffer.from(
      hre.ethers.utils.hexZeroPad(taskArgs.peerAddress, 32).slice(2),
      "hex"
    ).toString("hex")

    try {
      const tx = deserializeTransactionMessage(
        (await sdk.setPeer(taskArgs.peerEid, paddedPeerAddress))!.data
      )
      tx.sign(keypair)
      const txId = await sendAndConfirmTransaction(connection, tx, [keypair])
      console.log(`Transaction successful with ID: ${txId}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const [peer] = new OftPDA(publicKey(taskArgs.programId)).peer(
        publicKey(taskArgs.oftStore),
        taskArgs.peerEid
      )
      const peerInfo = await oft.accounts.fetchPeerConfig(
        { rpc: umi.rpc },
        peer
      )
      console.dir({ peerInfo }, { depth: null })
    } catch (error) {
      console.error(`setPeer failed:`, error)
    }
  })
