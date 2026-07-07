import { ethers } from 'ethers';

/**
 * Build a LayerZero V2 type-3 options bytes requesting executor gas for lzReceive.
 * Format: [type uint16=3][worker uint8=1][size uint16=17][optionType uint8=1][gas uint128]
 */
export function buildLzReceiveOptions(gas: number): string {
  const optionType = 1;
  const workerId = 1;
  const type3 = 3;
  const optionLength = 17; // 1 byte optionType + 16 bytes gas
  return ethers.solidityPacked(
    ['uint16', 'uint8', 'uint16', 'uint8', 'uint128'],
    [type3, workerId, optionLength, optionType, gas]
  );
}

export const DEFAULT_LZ_RECEIVE_GAS = 200_000;
