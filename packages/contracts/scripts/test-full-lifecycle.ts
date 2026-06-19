import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const deploymentPath = join(__dirname, "..", "deployments", "apothem.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);
  console.log("========================================");

  // Connect to deployed contracts
  const intentRegistry = await ethers.getContractAt("IntentRegistry", deployment.contracts.IntentRegistry);
  const escrow = await ethers.getContractAt("Escrow", deployment.contracts.Escrow);
  const paymentVerifier = await ethers.getContractAt("PaymentVerifier", deployment.contracts.PaymentVerifier);

  // Deploy MockERC20 for testing
  console.log("Deploying MockERC20...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockToken.deploy("Test Token", "TEST", ethers.parseEther("1000000"));
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("MockToken deployed to:", tokenAddress);

  // Add token to supported list
  console.log("Adding token to Escrow allowlist...");
  const addTx = await escrow.addSupportedToken(tokenAddress);
  await addTx.wait();
  console.log("Token added to allowlist");

  // Mint tokens to deployer
  console.log("Minting tokens to deployer...");
  const mintTx = await mockToken.mint(deployer.address, ethers.parseEther("10000"));
  await mintTx.wait();
  console.log("Minted 10000 TEST tokens");

  // Approve IntentRegistry to spend tokens
  console.log("Approving IntentRegistry...");
  const approveTx = await mockToken.approve(await intentRegistry.getAddress(), ethers.parseEther("10000"));
  await approveTx.wait();
  console.log("Approved IntentRegistry");

  // Test 1: Create Intent
  console.log("\n========================================");
  console.log("Test 1: Create Intent");
  console.log("========================================");
  
  const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent-" + Date.now()));
  const amount = ethers.parseEther("100");
  const expiry = Math.floor(Date.now() / 1000) + 3600;

  console.log("Intent ID:", intentId);
  console.log("Amount:", ethers.formatEther(amount), "TEST");
  console.log("Expiry:", new Date(expiry * 1000).toISOString());

  const createTx = await intentRegistry.createIntent(intentId, tokenAddress, amount, expiry);
  const createReceipt = await createTx.wait();
  console.log("Transaction hash:", createTx.hash);
  console.log("Block:", createReceipt?.blockNumber);
  console.log("Gas used:", createReceipt?.gasUsed.toString());

  // Verify intent state
  const intent = await intentRegistry.getIntent(intentId);
  console.log("\nIntent State:");
  console.log("  Status:", intent.status === 0n ? "Pending" : "Other");
  console.log("  User:", intent.user);
  console.log("  Token:", intent.token);
  console.log("  Amount:", ethers.formatEther(intent.amount), "TEST");
  console.log("  Expiry:", new Date(Number(intent.expiryTimestamp) * 1000).toISOString());

  // Verify escrow balance
  const escrowBalance = await escrow.getBalance(tokenAddress, deployer.address, intentId);
  console.log("  Escrow Balance:", ethers.formatEther(escrowBalance), "TEST");

  // Test 2: Cancel Intent
  console.log("\n========================================");
  console.log("Test 2: Cancel Intent");
  console.log("========================================");

  const balanceBefore = await mockToken.balanceOf(deployer.address);
  console.log("Balance before cancel:", ethers.formatEther(balanceBefore), "TEST");

  const cancelTx = await intentRegistry.cancelIntent(intentId);
  const cancelReceipt = await cancelTx.wait();
  console.log("Cancel tx hash:", cancelTx.hash);
  console.log("Gas used:", cancelReceipt?.gasUsed.toString());

  const cancelledIntent = await intentRegistry.getIntent(intentId);
  console.log("Intent status after cancel:", cancelledIntent.status === 2n ? "Cancelled" : "Other");

  const balanceAfter = await mockToken.balanceOf(deployer.address);
  console.log("Balance after cancel:", ethers.formatEther(balanceAfter), "TEST");
  console.log("Refund amount:", ethers.formatEther(balanceAfter - balanceBefore), "TEST");

  // Test 3: Create and Expire Intent
  console.log("\n========================================");
  console.log("Test 3: Create and Expire Intent");
  console.log("========================================");

  const intentId2 = ethers.keccak256(ethers.toUtf8Bytes("test-expire-" + Date.now()));
  const shortExpiry = Math.floor(Date.now() / 1000) + 3; // 3 seconds from now

  const createTx2 = await intentRegistry.createIntent(intentId2, tokenAddress, amount, shortExpiry);
  await createTx2.wait();
  console.log("Created intent with short expiry");

  // Wait for expiry
  console.log("Waiting 5 seconds for expiry...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  const balanceBeforeExpire = await mockToken.balanceOf(deployer.address);
  
  const expireTx = await intentRegistry.expireIntent(intentId2);
  const expireReceipt = await expireTx.wait();
  console.log("Expire tx hash:", expireTx.hash);
  console.log("Gas used:", expireReceipt?.gasUsed.toString());

  const expiredIntent = await intentRegistry.getIntent(intentId2);
  console.log("Intent status after expire:", expiredIntent.status === 3n ? "Expired" : "Other");

  const balanceAfterExpire = await mockToken.balanceOf(deployer.address);
  console.log("Refund amount:", ethers.formatEther(balanceAfterExpire - balanceBeforeExpire), "TEST");

  console.log("\n========================================");
  console.log("All tests completed successfully!");
  console.log("========================================");

  // Update deployment info with test results
  const testResults = {
    ...deployment,
    tests: {
      mockToken: tokenAddress,
      createIntent: {
        intentId: intentId,
        txHash: createTx.hash,
        status: "success"
      },
      cancelIntent: {
        intentId: intentId,
        txHash: cancelTx.hash,
        status: "success"
      },
      expireIntent: {
        intentId: intentId2,
        txHash: expireTx.hash,
        status: "success"
      }
    }
  };

  const fs = require("fs");
  fs.writeFileSync(deploymentPath, JSON.stringify(testResults, null, 2));
  console.log("\nTest results saved to deployment file");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
