import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  CampaignRegistry,
  EscrowVault,
  PledgeManager,
  OracleRegistry,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Pledge Protocol Integration", function () {
  let campaignRegistry: CampaignRegistry;
  let escrowVault: EscrowVault;
  let pledgeManager: PledgeManager;
  let oracleRegistry: OracleRegistry;

  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let backer1: SignerWithAddress;
  let backer2: SignerWithAddress;
  let attestor: SignerWithAddress;

  const ONE_DAY = 24 * 60 * 60;
  const ONE_WEEK = 7 * ONE_DAY;

  beforeEach(async function () {
    [owner, creator, beneficiary, backer1, backer2, attestor] = await ethers.getSigners();

    // Deploy contracts
    const CampaignRegistry = await ethers.getContractFactory("CampaignRegistry");
    campaignRegistry = await CampaignRegistry.deploy();
    await campaignRegistry.waitForDeployment();

    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    escrowVault = await EscrowVault.deploy(await campaignRegistry.getAddress());
    await escrowVault.waitForDeployment();

    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy();
    await oracleRegistry.waitForDeployment();

    const PledgeManager = await ethers.getContractFactory("PledgeManager");
    pledgeManager = await PledgeManager.deploy(
      await campaignRegistry.getAddress(),
      await escrowVault.getAddress(),
      await oracleRegistry.getAddress()
    );
    await pledgeManager.waitForDeployment();

    // Set up permissions
    await campaignRegistry.grantProtocolRole(await pledgeManager.getAddress());
    await escrowVault.grantProtocolRole(await pledgeManager.getAddress());
  });

  describe("Full Campaign Flow", function () {
    let campaignId: string;
    let oracleId: string;
    const milestoneId = ethers.keccak256(ethers.toUtf8Bytes("completion"));

    beforeEach(async function () {
      // Register an attestor
      const tx1 = await oracleRegistry.registerOracle(
        attestor.address,
        "Marathon Attestor",
        0 // Attestation type
      );
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs.find(
        (log: any) => log.fragment?.name === "OracleRegistered"
      ) as any;
      oracleId = event1.args[0];

      // Create a campaign
      const now = await time.latest();
      const tx2 = await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + 100,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://QmCampaign"
      );
      const receipt2 = await tx2.wait();
      const event2 = receipt2?.logs.find(
        (log: any) => log.fragment?.name === "CampaignCreated"
      ) as any;
      campaignId = event2.args[0];

      // Activate campaign
      await campaignRegistry.connect(creator).activateCampaign(campaignId);

      // Move to pledge window
      await time.increase(101);
    });

    it("should allow backers to create pledges", async function () {
      const pledgeAmount = ethers.parseEther("1");

      const tx = await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0, // Flat
        "Alice",
        { value: pledgeAmount }
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "PledgeCreated"
      ) as any;

      expect(event).to.not.be.undefined;
      expect(event.args[2]).to.equal(backer1.address);
      expect(event.args[3]).to.equal(pledgeAmount);

      // Verify escrow
      const campaignBalance = await escrowVault.getCampaignBalance(campaignId);
      expect(campaignBalance).to.equal(pledgeAmount);
    });

    it("should allow multiple pledges from different backers", async function () {
      const pledge1Amount = ethers.parseEther("1");
      const pledge2Amount = ethers.parseEther("2");

      await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0,
        "Alice",
        { value: pledge1Amount }
      );

      await pledgeManager.connect(backer2).createPledge(
        campaignId,
        0,
        "Bob",
        { value: pledge2Amount }
      );

      const campaignBalance = await escrowVault.getCampaignBalance(campaignId);
      expect(campaignBalance).to.equal(pledge1Amount + pledge2Amount);

      const pledgeIds = await pledgeManager.getCampaignPledges(campaignId);
      expect(pledgeIds.length).to.equal(2);
    });

    it("should resolve pledges on milestone completion", async function () {
      const pledgeAmount = ethers.parseEther("1");

      // Create pledge
      const tx = await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0,
        "Alice",
        { value: pledgeAmount }
      );
      const receipt = await tx.wait();
      const pledgeEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "PledgeCreated"
      ) as any;
      const pledgeId = pledgeEvent.args[0];

      // Get beneficiary balance before
      const beneficiaryBalanceBefore = await ethers.provider.getBalance(beneficiary.address);

      // Resolve pledge (milestone completed)
      await pledgeManager.resolvePledge(pledgeId, pledgeAmount, 0);

      // Verify pledge status
      const pledge = await pledgeManager.getPledge(pledgeId);
      expect(pledge.status).to.equal(1); // Resolved
      expect(pledge.finalAmount).to.equal(pledgeAmount);

      // Verify funds released to beneficiary
      const beneficiaryBalanceAfter = await ethers.provider.getBalance(beneficiary.address);
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(pledgeAmount);
    });

    it("should refund pledges on milestone failure", async function () {
      const pledgeAmount = ethers.parseEther("1");

      // Create pledge
      const tx = await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0,
        "Alice",
        { value: pledgeAmount }
      );
      const receipt = await tx.wait();
      const pledgeEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "PledgeCreated"
      ) as any;
      const pledgeId = pledgeEvent.args[0];

      // Get backer balance before
      const backerBalanceBefore = await ethers.provider.getBalance(backer1.address);

      // Resolve pledge (milestone failed - full refund)
      await pledgeManager.resolvePledge(pledgeId, 0, pledgeAmount);

      // Verify pledge status
      const pledge = await pledgeManager.getPledge(pledgeId);
      expect(pledge.status).to.equal(1); // Resolved
      expect(pledge.finalAmount).to.equal(0n);

      // Verify funds refunded to backer
      const backerBalanceAfter = await ethers.provider.getBalance(backer1.address);
      expect(backerBalanceAfter - backerBalanceBefore).to.equal(pledgeAmount);
    });

    it("should resolve all pledges for a campaign", async function () {
      const pledge1Amount = ethers.parseEther("1");
      const pledge2Amount = ethers.parseEther("2");

      // Create pledges
      await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0,
        "Alice",
        { value: pledge1Amount }
      );

      await pledgeManager.connect(backer2).createPledge(
        campaignId,
        0,
        "Bob",
        { value: pledge2Amount }
      );

      // Get beneficiary balance before
      const beneficiaryBalanceBefore = await ethers.provider.getBalance(beneficiary.address);

      // Resolve all pledges (milestone completed)
      await pledgeManager.resolveAllPledges(campaignId, true);

      // Verify campaign status
      const campaign = await campaignRegistry.getCampaign(campaignId);
      expect(campaign.status).to.equal(3); // Resolved
      expect(campaign.totalReleased).to.equal(pledge1Amount + pledge2Amount);
      expect(campaign.totalRefunded).to.equal(0n);

      // Verify funds released to beneficiary
      const beneficiaryBalanceAfter = await ethers.provider.getBalance(beneficiary.address);
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
        pledge1Amount + pledge2Amount
      );
    });

    it("should allow backer to cancel pledge during pledge window", async function () {
      const pledgeAmount = ethers.parseEther("1");

      // Create pledge
      const tx = await pledgeManager.connect(backer1).createPledge(
        campaignId,
        0,
        "Alice",
        { value: pledgeAmount }
      );
      const receipt = await tx.wait();
      const pledgeEvent = receipt?.logs.find(
        (log: any) => log.fragment?.name === "PledgeCreated"
      ) as any;
      const pledgeId = pledgeEvent.args[0];

      // Get backer balance before
      const backerBalanceBefore = await ethers.provider.getBalance(backer1.address);

      // Cancel pledge
      const cancelTx = await pledgeManager.connect(backer1).cancelPledge(pledgeId);
      const cancelReceipt = await cancelTx.wait();
      const gasCost = cancelReceipt!.gasUsed * cancelReceipt!.gasPrice;

      // Verify pledge status
      const pledge = await pledgeManager.getPledge(pledgeId);
      expect(pledge.status).to.equal(3); // Cancelled

      // Verify funds refunded to backer (minus gas)
      const backerBalanceAfter = await ethers.provider.getBalance(backer1.address);
      expect(backerBalanceAfter + gasCost - backerBalanceBefore).to.equal(pledgeAmount);
    });

    it("should reject pledge below minimum", async function () {
      const belowMinimum = ethers.parseEther("0.01");

      await expect(
        pledgeManager.connect(backer1).createPledge(
          campaignId,
          0,
          "Alice",
          { value: belowMinimum }
        )
      ).to.be.revertedWith("Below minimum pledge");
    });

    it("should reject pledge above maximum", async function () {
      const aboveMaximum = ethers.parseEther("20");

      await expect(
        pledgeManager.connect(backer1).createPledge(
          campaignId,
          0,
          "Alice",
          { value: aboveMaximum }
        )
      ).to.be.revertedWith("Exceeds maximum pledge");
    });

    it("should reject pledge outside pledge window", async function () {
      // Move past pledge window
      await time.increase(ONE_WEEK + ONE_DAY);

      await expect(
        pledgeManager.connect(backer1).createPledge(
          campaignId,
          0,
          "Alice",
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("Pledging not open");
    });
  });

  describe("Oracle Attestation", function () {
    let oracleId: string;
    const campaignId = ethers.keccak256(ethers.toUtf8Bytes("campaign1"));
    const milestoneId = ethers.keccak256(ethers.toUtf8Bytes("completion"));

    beforeEach(async function () {
      const tx = await oracleRegistry.registerOracle(
        attestor.address,
        "Marathon Attestor",
        0
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "OracleRegistered"
      ) as any;
      oracleId = event.args[0];
    });

    it("should accept valid attestation", async function () {
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "bytes32", "bool", "uint256", "string"],
          [campaignId, milestoneId, true, 2620, "ipfs://QmEvidence"]
        )
      );
      const signature = await attestor.signMessage(ethers.getBytes(messageHash));

      await expect(
        oracleRegistry.connect(attestor).submitAttestation(
          campaignId,
          milestoneId,
          true,
          2620, // 26.2 miles in tenths
          "ipfs://QmEvidence",
          "Runner completed marathon",
          signature
        )
      ).to.emit(oracleRegistry, "AttestationSubmitted");

      const attestation = await oracleRegistry.getAttestation(campaignId, milestoneId);
      expect(attestation.completed).to.be.true;
      expect(attestation.value).to.equal(2620);
    });

    it("should reject attestation from non-attestor", async function () {
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "bytes32", "bool", "uint256", "string"],
          [campaignId, milestoneId, true, 2620, "ipfs://QmEvidence"]
        )
      );
      const signature = await backer1.signMessage(ethers.getBytes(messageHash));

      await expect(
        oracleRegistry.connect(backer1).submitAttestation(
          campaignId,
          milestoneId,
          true,
          2620,
          "ipfs://QmEvidence",
          "Runner completed marathon",
          signature
        )
      ).to.be.revertedWith("Not a registered attestor");
    });

    it("should reject duplicate attestation", async function () {
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "bytes32", "bool", "uint256", "string"],
          [campaignId, milestoneId, true, 2620, "ipfs://QmEvidence"]
        )
      );
      const signature = await attestor.signMessage(ethers.getBytes(messageHash));

      await oracleRegistry.connect(attestor).submitAttestation(
        campaignId,
        milestoneId,
        true,
        2620,
        "ipfs://QmEvidence",
        "Runner completed marathon",
        signature
      );

      await expect(
        oracleRegistry.connect(attestor).submitAttestation(
          campaignId,
          milestoneId,
          true,
          2620,
          "ipfs://QmEvidence",
          "Runner completed marathon",
          signature
        )
      ).to.be.revertedWith("Attestation already exists");
    });
  });
});
