import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Pledge Protocol contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log();

  // Deploy CampaignRegistry
  console.log("1. Deploying CampaignRegistry...");
  const CampaignRegistry = await ethers.getContractFactory("CampaignRegistry");
  const campaignRegistry = await CampaignRegistry.deploy();
  await campaignRegistry.waitForDeployment();
  const campaignRegistryAddress = await campaignRegistry.getAddress();
  console.log("   CampaignRegistry deployed to:", campaignRegistryAddress);

  // Deploy EscrowVault
  console.log("2. Deploying EscrowVault...");
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const escrowVault = await EscrowVault.deploy(campaignRegistryAddress);
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  console.log("   EscrowVault deployed to:", escrowVaultAddress);

  // Deploy OracleRegistry
  console.log("3. Deploying OracleRegistry...");
  const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
  const oracleRegistry = await OracleRegistry.deploy();
  await oracleRegistry.waitForDeployment();
  const oracleRegistryAddress = await oracleRegistry.getAddress();
  console.log("   OracleRegistry deployed to:", oracleRegistryAddress);

  // Deploy PledgeManager
  console.log("4. Deploying PledgeManager...");
  const PledgeManager = await ethers.getContractFactory("PledgeManager");
  const pledgeManager = await PledgeManager.deploy(
    campaignRegistryAddress,
    escrowVaultAddress,
    oracleRegistryAddress
  );
  await pledgeManager.waitForDeployment();
  const pledgeManagerAddress = await pledgeManager.getAddress();
  console.log("   PledgeManager deployed to:", pledgeManagerAddress);

  // Deploy PledgeToken
  console.log("5. Deploying PledgeToken...");
  const PledgeToken = await ethers.getContractFactory("PledgeToken");
  const pledgeToken = await PledgeToken.deploy("https://api.pledgeprotocol.xyz/tokens/pledge/");
  await pledgeToken.waitForDeployment();
  const pledgeTokenAddress = await pledgeToken.getAddress();
  console.log("   PledgeToken deployed to:", pledgeTokenAddress);

  // Deploy CommemorativeToken
  console.log("6. Deploying CommemorativeToken...");
  const CommemorativeToken = await ethers.getContractFactory("CommemorativeToken");
  const commemorativeToken = await CommemorativeToken.deploy("https://api.pledgeprotocol.xyz/tokens/commemorative/");
  await commemorativeToken.waitForDeployment();
  const commemorativeTokenAddress = await commemorativeToken.getAddress();
  console.log("   CommemorativeToken deployed to:", commemorativeTokenAddress);

  console.log("\n--- Setting up roles and permissions ---\n");

  // Grant PROTOCOL_ROLE to PledgeManager in CampaignRegistry
  console.log("Granting PROTOCOL_ROLE to PledgeManager in CampaignRegistry...");
  await campaignRegistry.grantProtocolRole(pledgeManagerAddress);

  // Grant PROTOCOL_ROLE to PledgeManager in EscrowVault
  console.log("Granting PROTOCOL_ROLE to PledgeManager in EscrowVault...");
  await escrowVault.grantProtocolRole(pledgeManagerAddress);

  // Grant MINTER_ROLE to PledgeManager in PledgeToken
  console.log("Granting MINTER_ROLE to PledgeManager in PledgeToken...");
  await pledgeToken.grantMinterRole(pledgeManagerAddress);

  // Grant BURNER_ROLE to PledgeManager in PledgeToken
  console.log("Granting BURNER_ROLE to PledgeManager in PledgeToken...");
  await pledgeToken.grantBurnerRole(pledgeManagerAddress);

  // Grant MINTER_ROLE to PledgeManager in CommemorativeToken
  console.log("Granting MINTER_ROLE to PledgeManager in CommemorativeToken...");
  await commemorativeToken.grantMinterRole(pledgeManagerAddress);

  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================\n");

  console.log("Contract Addresses:");
  console.log("-------------------");
  console.log(`CampaignRegistry:    ${campaignRegistryAddress}`);
  console.log(`EscrowVault:         ${escrowVaultAddress}`);
  console.log(`OracleRegistry:      ${oracleRegistryAddress}`);
  console.log(`PledgeManager:       ${pledgeManagerAddress}`);
  console.log(`PledgeToken:         ${pledgeTokenAddress}`);
  console.log(`CommemorativeToken:  ${commemorativeTokenAddress}`);

  // Return addresses for verification/testing
  return {
    campaignRegistry: campaignRegistryAddress,
    escrowVault: escrowVaultAddress,
    oracleRegistry: oracleRegistryAddress,
    pledgeManager: pledgeManagerAddress,
    pledgeToken: pledgeTokenAddress,
    commemorativeToken: commemorativeTokenAddress,
  };
}

main()
  .then((addresses) => {
    console.log("\nDeployment addresses:", JSON.stringify(addresses, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
