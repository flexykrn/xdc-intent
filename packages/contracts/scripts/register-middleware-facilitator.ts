import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const paymentVerifierAddress = process.env.PAYMENT_VERIFIER_ADDRESS;
  const middlewareSignerKey = process.env.MIDDLEWARE_SIGNER_PRIVATE_KEY;

  if (!paymentVerifierAddress || !middlewareSignerKey) {
    throw new Error('Missing PAYMENT_VERIFIER_ADDRESS or MIDDLEWARE_SIGNER_PRIVATE_KEY');
  }

  const signer = new ethers.Wallet(middlewareSignerKey);
  const pv = await ethers.getContractAt('PaymentVerifier', paymentVerifierAddress);
  const tx = await pv.registerFacilitator(signer.address);
  await tx.wait();
  console.log(`Registered middleware signer ${signer.address} as facilitator`);
}

main().catch(e => { console.error(e); process.exit(1); });
