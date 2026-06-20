import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const deploymentPath = join(__dirname, "..", "deployments", "apothem.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log("Integration Test Account:", deployer.address);
  console.log("========================================");

  // Connect to deployed contracts
  const intentRegistry = await ethers.getContractAt("IntentRegistry", deployment.contracts.IntentRegistry);
  const escrow = await ethers.getContractAt("Escrow", deployment.contracts.Escrow);
  const paymentVerifier = await ethers.getContractAt("PaymentVerifier", deployment.contracts.PaymentVerifier);

  // Deploy MockERC20 for testing
  console.log("\n1. Deploying MockERC20...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockToken.deploy("Test Token", "TEST", ethers.parseEther("1000000"));
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("   MockToken:", tokenAddress);

  // Add token to supported list
  console.log("\n2. Adding token to Escrow...");
  const addTx = await escrow.addSupportedToken(tokenAddress);
  await addTx.wait();
  console.log("   ✓ Token added");

  // Mint tokens
  console.log("\n3. Minting tokens to deployer...");
  const mintTx = await mockToken.mint(deployer.address, ethers.parseEther("10000"));
  await mintTx.wait();
  console.log("   ✓ Minted 10000 TEST");

  // Approve IntentRegistry
  console.log("\n4. Approving IntentRegistry...");
  const approveTx = await mockToken.approve(await intentRegistry.getAddress(), ethers.parseEther("10000"));
  await approveTx.wait();
  console.log("   ✓ Approved");

  // Create intent
  console.log("\n5. Creating intent...");
  const intentId = ethers.keccak256(ethers.toUtf8Bytes("integration-test-" + Date.now()));
  const amount = ethers.parseEther("100");
  const block = await ethers.provider.getBlock("latest");
  const expiry = block!.timestamp + 3600; // 1 hour from now

  const createTx = await intentRegistry.createIntent(intentId, tokenAddress, amount, expiry);
  await createTx.wait();
  console.log("   ✓ Intent created:", intentId);

  // Verify intent state
  const intent = await intentRegistry.getIntent(intentId);
  console.log("   Status:", intent.status === 0n ? "Pending" : "Other");
  console.log("   Amount:", ethers.formatEther(intent.amount), "TEST");

  // Test middleware payment request
  console.log("\n6. Testing middleware payment request...");
  const middlewareUrl = "http://localhost:3000";
  
  try {
    const response = await fetch(`${middlewareUrl}/v1/payment-request?intentId=${intentId}&payer=${deployer.address}`, {
      headers: { "X-API-Key": "testne...2024" }
    });
    
    if (response.status === 402) {
      const paymentRequest = await response.json();
      console.log("   ✓ Payment required:", paymentRequest.amount, "TEST");
      console.log("   Recipient:", paymentRequest.recipient);
      console.log("   Nonce:", paymentRequest.nonce);

      // Test payment acceptance
      console.log("\n7. Testing payment acceptance...");
      
      // Create solver signature
      const message = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "uint256", "string"],
          [intentId, deployer.address, ethers.parseEther(paymentRequest.amount), paymentRequest.nonce]
        )
      );
      const signature = await deployer.signMessage(ethers.getBytes(message));

      const payResponse = await fetch(`${middlewareUrl}/v1/pay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "testne...2024"
        },
        body: JSON.stringify({
          intentId,
          solverAddress: deployer.address,
          amount: paymentRequest.amount,
          nonce: paymentRequest.nonce,
          signature
        })
      });

      if (payResponse.ok) {
        const proof = await payResponse.json();
        console.log("   ✓ Payment accepted");
        console.log("   Proof signature:", proof.signature.substring(0, 50) + "...");

        // Test proof verification
        console.log("\n8. Testing proof verification...");
        const verifyResponse = await fetch(`${middlewareUrl}/v1/verify?proof=${encodeURIComponent(JSON.stringify(proof.proof))}&signature=${proof.signature}`);
        const verifyResult = await verifyResponse.json();
        console.log("   Valid:", verifyResult.valid);

        // Test contract verification
        console.log("\n9. Testing contract verification...");
        const isValid = await paymentVerifier.verifyPayment(proof.proof, proof.signature);
        console.log("   Contract valid:", isValid);

        // Test metrics
        console.log("\n10. Testing metrics...");
        const metricsResponse = await fetch(`${middlewareUrl}/v1/metrics`);
        const metrics = await metricsResponse.json();
        console.log("   Total requests:", metrics.totalRequests);
        console.log("   Proofs issued:", metrics.proofsIssued);

      } else {
        console.log("   ✗ Payment failed:", await payResponse.text());
      }
    } else {
      console.log("   ✗ Unexpected status:", response.status, await response.text());
    }
  } catch (error: any) {
    console.log("   ✗ Middleware error:", error.message);
    console.log("   (Make sure middleware is running on port 3000)");
  }

  // Test refund
  console.log("\n11. Testing refund...");
  try {
    const refundResponse = await fetch(`${middlewareUrl}/v1/refund`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-API-Key": "testne...2024"
      },
      body: JSON.stringify({
        intentId,
        solverAddress: deployer.address
      })
    });
    
    if (refundResponse.ok) {
      console.log("   ✓ Refund processed");
    } else {
      console.log("   Refund response:", refundResponse.status, await refundResponse.text());
    }
  } catch (error: any) {
    console.log("   Refund error:", error.message);
  }

  console.log("\n========================================");
  console.log("Integration test completed!");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
