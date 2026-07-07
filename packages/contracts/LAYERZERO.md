# LayerZero V2 Testnet Reference

This document records the LayerZero V2 endpoint addresses used by the `IntentLZBridge` Phase 7 implementation.

## Important blocker

**XDC Apothem (chain ID 51) does not currently have an official LayerZero V2 testnet endpoint.** LayerZero supports XDC mainnet (chain ID 50, eid 30365) but not the Apothem testnet in its public metadata. Because of this, a *real* Apothem ↔ testnet LayerZero message is not possible today. The contracts and scripts are written so that they work against any LayerZero V2 endpoint; on Apothem you can either:

1. Wait for LayerZero to deploy an Apothem testnet endpoint and set `LZ_ENDPOINT` / `LZ_SOURCE_EID` accordingly.
2. Run the `MockLayerZeroEndpoint` on Apothem for local/CI simulation only.
3. Use a supported testnet (e.g. Sepolia) as the source chain for a real end-to-end test.

## Supported destination testnet: Ethereum Sepolia

| Network            | Chain ID (native) | LayerZero eid | EndpointV2 address                         |
|--------------------|-------------------|---------------|--------------------------------------------|
| Ethereum Sepolia   | 11155111          | 40161         | `0x6EDCE65403992e310A62460808c4b910D972f10f` |

Other supported EVM testnets can be used as well; Sepolia was chosen because it is widely faucet-funded and well documented.

## XDC mainnet reference (not testnet)

| Network            | Chain ID (native) | LayerZero eid | EndpointV2 address                         |
|--------------------|-------------------|---------------|--------------------------------------------|
| XDC Mainnet        | 50                | 30365         | `0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa` |

## Required options format

`IntentLZBridge.bridgeOut` accepts an arbitrary `options` bytes argument. For a standard EVM → EVM transfer the options should request executor gas for `lzReceive`. A TypeScript helper (`buildLzReceiveOptions`) is provided in `scripts/lz-options.ts`.

## Environment variables

| Variable               | Purpose                                                          |
|------------------------|------------------------------------------------------------------|
| `LZ_ENDPOINT`          | Address of the LayerZero EndpointV2 on the current network       |
| `LZ_SOURCE_EID`        | LayerZero eid of the source chain                                |
| `LZ_DEST_EID`          | LayerZero eid of the destination chain                           |
| `LZ_BRIDGE_ADDRESS`    | Deployed `IntentLZBridge` address for the solver                 |
| `LZ_DEST_TOKEN`        | Token to deliver on the destination chain (defaults to source token) |
| `LZ_RECEIVE_GAS`       | Gas passed in the executor `lzReceive` option (default 200k)     |
| `SEPOLIA_RPC_URL`      | RPC for the Sepolia testnet deployment script                    |

## Follow-ups

- Fund testnet wallets on both source and destination chains.
- Set up a LayerZero testnet DVN/executor path between the chains; on Sepolia this is handled by the default send/receive libraries.
- Acquire native gas tokens for relayer fees on the source chain.
- Replace the Apothem mock endpoint with an official LZ endpoint when/if available.
