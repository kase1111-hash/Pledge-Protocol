import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { CampaignRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CampaignRegistry", function () {
  let campaignRegistry: CampaignRegistry;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let other: SignerWithAddress;

  const ONE_DAY = 24 * 60 * 60;
  const ONE_WEEK = 7 * ONE_DAY;

  beforeEach(async function () {
    [owner, creator, beneficiary, other] = await ethers.getSigners();

    const CampaignRegistry = await ethers.getContractFactory("CampaignRegistry");
    campaignRegistry = await CampaignRegistry.deploy();
    await campaignRegistry.waitForDeployment();
  });

  describe("Campaign Creation", function () {
    it("should create a campaign successfully", async function () {
      const now = await time.latest();
      const pledgeWindowStart = now + ONE_DAY;
      const pledgeWindowEnd = now + ONE_WEEK;
      const resolutionDeadline = now + ONE_WEEK + ONE_DAY;

      const tx = await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        pledgeWindowStart,
        pledgeWindowEnd,
        resolutionDeadline,
        ethers.parseEther("0.01"),
        ethers.parseEther("10"),
        "ipfs://QmTest"
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "CampaignCreated"
      );

      expect(event).to.not.be.undefined;
    });

    it("should reject invalid beneficiary", async function () {
      const now = await time.latest();

      await expect(
        campaignRegistry.connect(creator).createCampaign(
          ethers.ZeroAddress,
          now + ONE_DAY,
          now + ONE_WEEK,
          now + ONE_WEEK + ONE_DAY,
          ethers.parseEther("0.01"),
          0,
          "ipfs://QmTest"
        )
      ).to.be.revertedWith("Invalid beneficiary");
    });

    it("should reject invalid pledge window", async function () {
      const now = await time.latest();

      await expect(
        campaignRegistry.connect(creator).createCampaign(
          beneficiary.address,
          now + ONE_WEEK,
          now + ONE_DAY, // End before start
          now + ONE_WEEK + ONE_DAY,
          ethers.parseEther("0.01"),
          0,
          "ipfs://QmTest"
        )
      ).to.be.revertedWith("Invalid pledge window");
    });

    it("should reject resolution before pledge window end", async function () {
      const now = await time.latest();

      await expect(
        campaignRegistry.connect(creator).createCampaign(
          beneficiary.address,
          now + ONE_DAY,
          now + ONE_WEEK + ONE_DAY,
          now + ONE_WEEK, // Resolution before window end
          ethers.parseEther("0.01"),
          0,
          "ipfs://QmTest"
        )
      ).to.be.revertedWith("Resolution must be after pledge window");
    });

    it("should reject empty metadata URI", async function () {
      const now = await time.latest();

      await expect(
        campaignRegistry.connect(creator).createCampaign(
          beneficiary.address,
          now + ONE_DAY,
          now + ONE_WEEK,
          now + ONE_WEEK + ONE_DAY,
          ethers.parseEther("0.01"),
          0,
          ""
        )
      ).to.be.revertedWith("Metadata URI required");
    });
  });

  describe("Campaign Activation", function () {
    let campaignId: string;

    beforeEach(async function () {
      const now = await time.latest();
      const tx = await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest"
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "CampaignCreated"
      ) as any;
      campaignId = event.args[0];
    });

    it("should activate a draft campaign", async function () {
      await expect(campaignRegistry.connect(creator).activateCampaign(campaignId))
        .to.emit(campaignRegistry, "CampaignActivated")
        .withArgs(campaignId, await time.latest() + 1);

      const campaign = await campaignRegistry.getCampaign(campaignId);
      expect(campaign.status).to.equal(1); // Active
    });

    it("should reject activation by non-creator", async function () {
      await expect(
        campaignRegistry.connect(other).activateCampaign(campaignId)
      ).to.be.revertedWith("Only creator can activate");
    });

    it("should reject double activation", async function () {
      await campaignRegistry.connect(creator).activateCampaign(campaignId);

      await expect(
        campaignRegistry.connect(creator).activateCampaign(campaignId)
      ).to.be.revertedWith("Campaign must be in draft");
    });
  });

  describe("Pledging Status", function () {
    let campaignId: string;

    beforeEach(async function () {
      const now = await time.latest();
      const tx = await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest"
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "CampaignCreated"
      ) as any;
      campaignId = event.args[0];
    });

    it("should return false when campaign is not active", async function () {
      expect(await campaignRegistry.isPledgingOpen(campaignId)).to.be.false;
    });

    it("should return false when before pledge window", async function () {
      await campaignRegistry.connect(creator).activateCampaign(campaignId);
      expect(await campaignRegistry.isPledgingOpen(campaignId)).to.be.false;
    });

    it("should return true during pledge window", async function () {
      await campaignRegistry.connect(creator).activateCampaign(campaignId);
      await time.increase(ONE_DAY + 1);
      expect(await campaignRegistry.isPledgingOpen(campaignId)).to.be.true;
    });

    it("should return false after pledge window", async function () {
      await campaignRegistry.connect(creator).activateCampaign(campaignId);
      await time.increase(ONE_WEEK + ONE_DAY);
      expect(await campaignRegistry.isPledgingOpen(campaignId)).to.be.false;
    });
  });

  describe("Campaign Cancellation", function () {
    let campaignId: string;

    beforeEach(async function () {
      const now = await time.latest();
      const tx = await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest"
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "CampaignCreated"
      ) as any;
      campaignId = event.args[0];
    });

    it("should cancel a draft campaign", async function () {
      await expect(campaignRegistry.connect(creator).cancelCampaign(campaignId))
        .to.emit(campaignRegistry, "CampaignCancelled");

      const campaign = await campaignRegistry.getCampaign(campaignId);
      expect(campaign.status).to.equal(5); // Cancelled
    });

    it("should cancel an active campaign", async function () {
      await campaignRegistry.connect(creator).activateCampaign(campaignId);

      await expect(campaignRegistry.connect(creator).cancelCampaign(campaignId))
        .to.emit(campaignRegistry, "CampaignCancelled");
    });

    it("should reject cancellation by non-creator", async function () {
      await expect(
        campaignRegistry.connect(other).cancelCampaign(campaignId)
      ).to.be.revertedWith("Only creator can cancel");
    });
  });

  describe("View Functions", function () {
    it("should return creator campaigns", async function () {
      const now = await time.latest();

      await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest1"
      );

      await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest2"
      );

      const campaigns = await campaignRegistry.getCreatorCampaigns(creator.address);
      expect(campaigns.length).to.equal(2);
    });

    it("should return correct campaign count", async function () {
      expect(await campaignRegistry.getCampaignCount()).to.equal(0);

      const now = await time.latest();
      await campaignRegistry.connect(creator).createCampaign(
        beneficiary.address,
        now + ONE_DAY,
        now + ONE_WEEK,
        now + ONE_WEEK + ONE_DAY,
        ethers.parseEther("0.01"),
        0,
        "ipfs://QmTest"
      );

      expect(await campaignRegistry.getCampaignCount()).to.equal(1);
    });
  });
});
