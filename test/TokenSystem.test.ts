import { expect } from "chai";
import {
  ImageGenerator,
  MetadataGenerator,
  StorageService,
  CommemorativeService,
  PledgeTokenService,
  CommemorativeData,
  RaceFinishData,
  AcademicData,
  CreativeData,
  PledgeTokenData,
  GenerationRequest,
  CampaignGenerationRequest
} from "../src/tokens";

describe("Token System (Phase 3)", function () {
  describe("Image Generator", function () {
    let imageGenerator: ImageGenerator;

    beforeEach(function () {
      imageGenerator = new ImageGenerator();
    });

    describe("Template Generation", function () {
      const baseData: CommemorativeData = {
        pledgeId: "pledge_12345678",
        campaignId: "campaign_abcd",
        campaignName: "Marathon Training Support",
        subjectName: "John Runner",
        beneficiaryName: "John Runner",
        backerName: "Alice Supporter",
        backerAddress: "0x1234567890abcdef1234567890abcdef12345678",
        contributionAmount: "0.5",
        totalCampaignRaised: "10.0",
        pledgedAt: 1700000000,
        resolvedAt: 1702000000,
        outcomeSummary: "Successfully completed the Boston Marathon",
        templateType: "generic"
      };

      it("should generate a generic template SVG", async function () {
        const result = await imageGenerator.generate(baseData);

        expect(result).to.have.property("svg");
        expect(result).to.have.property("width", 800);
        expect(result).to.have.property("height", 1000);
        expect(result.svg).to.include("PLEDGE PROTOCOL");
        expect(result.svg).to.include("Marathon Training Support");
        expect(result.svg).to.include("Alice Supporter");
      });

      it("should generate a race finish template SVG", async function () {
        const raceData: RaceFinishData = {
          ...baseData,
          templateType: "race_finish",
          customData: {
            raceName: "Boston Marathon",
            raceDate: "April 15, 2024",
            finishTime: "3:42:15",
            pace: "8:30",
            distance: "26.2 miles",
            bibNumber: "12345",
            placement: "#1523 Overall",
            runnerName: "John Runner"
          }
        };

        const result = await imageGenerator.generate(raceData);

        expect(result.svg).to.include("Boston Marathon");
        expect(result.svg).to.include("12345");
        expect(result.svg).to.include("3:42:15");
        expect(result.svg).to.include("8:30");
      });

      it("should generate an academic template SVG", async function () {
        const academicData: AcademicData = {
          ...baseData,
          templateType: "academic",
          campaignName: "Computer Science Degree",
          subjectName: "Jane Student",
          customData: {
            institutionName: "MIT",
            degreeName: "Bachelor of Science in Computer Science",
            graduationDate: "May 2024",
            honors: "Magna Cum Laude",
            studentName: "Jane Student"
          }
        };

        const result = await imageGenerator.generate(academicData);

        expect(result.svg).to.include("MIT");
        expect(result.svg).to.include("Bachelor of Science");
        expect(result.svg).to.include("Jane Student");
        expect(result.svg).to.include("Magna Cum Laude");
      });

      it("should generate a creative template SVG", async function () {
        const creativeData: CreativeData = {
          ...baseData,
          templateType: "creative",
          campaignName: "Debut Album",
          customData: {
            projectTitle: "Midnight Dreams",
            creatorName: "The Starlight Band",
            releaseDate: "December 2024",
            genre: "Indie Rock",
            description: "A journey through sound and emotion"
          }
        };

        const result = await imageGenerator.generate(creativeData);

        expect(result.svg).to.include("Midnight Dreams");
        expect(result.svg).to.include("The Starlight Band");
        expect(result.svg).to.include("Indie Rock");
      });
    });

    describe("Template Validation", function () {
      it("should validate required fields", function () {
        const invalidData = {
          pledgeId: "",
          campaignId: "",
          campaignName: "",
          templateType: "generic" as const
        } as CommemorativeData;

        const result = imageGenerator.validateTemplateData(invalidData);

        expect(result.valid).to.be.false;
        expect(result.errors).to.include("pledgeId is required");
        expect(result.errors).to.include("campaignId is required");
        expect(result.errors).to.include("backerAddress is required");
      });

      it("should validate race_finish template specific fields", function () {
        const invalidRaceData = {
          pledgeId: "pledge_123",
          campaignId: "campaign_abc",
          campaignName: "Race",
          backerAddress: "0x123",
          contributionAmount: "1.0",
          templateType: "race_finish" as const,
          customData: {}
        } as RaceFinishData;

        const result = imageGenerator.validateTemplateData(invalidRaceData);

        expect(result.valid).to.be.false;
        expect(result.errors).to.include("raceName is required for race_finish template");
        expect(result.errors).to.include("finishTime is required for race_finish template");
        expect(result.errors).to.include("bibNumber is required for race_finish template");
      });
    });

    describe("Template Types", function () {
      it("should return all available template types", function () {
        const types = imageGenerator.getTemplateTypes();

        expect(types).to.include("race_finish");
        expect(types).to.include("academic");
        expect(types).to.include("creative");
        expect(types).to.include("generic");
        expect(types).to.have.length(4);
      });
    });
  });

  describe("Metadata Generator", function () {
    let metadataGenerator: MetadataGenerator;

    beforeEach(function () {
      metadataGenerator = new MetadataGenerator("https://pledge.protocol");
    });

    describe("Pledge Token Metadata", function () {
      const pledgeData: PledgeTokenData = {
        pledgeId: "pledge_12345678",
        campaignId: "campaign_abcd",
        campaignName: "Test Campaign",
        backerAddress: "0x1234567890abcdef1234567890abcdef12345678",
        pledgeAmount: "1.5",
        pledgeType: "flat",
        pledgedAt: 1700000000,
        status: "active"
      };

      it("should generate valid ERC-721 metadata", function () {
        const metadata = metadataGenerator.generatePledgeTokenMetadata(
          pledgeData,
          "ipfs://QmTest123"
        );

        expect(metadata).to.have.property("name");
        expect(metadata).to.have.property("description");
        expect(metadata).to.have.property("image", "ipfs://QmTest123");
        expect(metadata).to.have.property("external_url");
        expect(metadata).to.have.property("attributes");
        expect(metadata.attributes).to.be.an("array");
      });

      it("should include correct attributes", function () {
        const metadata = metadataGenerator.generatePledgeTokenMetadata(
          pledgeData,
          "ipfs://QmTest123"
        );

        const campaignAttr = metadata.attributes.find(
          a => a.trait_type === "Campaign Name"
        );
        expect(campaignAttr).to.exist;
        expect(campaignAttr!.value).to.equal("Test Campaign");

        const statusAttr = metadata.attributes.find(
          a => a.trait_type === "Status"
        );
        expect(statusAttr).to.exist;
        expect(statusAttr!.value).to.equal("Active");
      });

      it("should include milestone count when provided", function () {
        const dataWithMilestones: PledgeTokenData = {
          ...pledgeData,
          milestones: ["m1", "m2", "m3"]
        };

        const metadata = metadataGenerator.generatePledgeTokenMetadata(
          dataWithMilestones,
          "ipfs://QmTest123"
        );

        const milestonesAttr = metadata.attributes.find(
          a => a.trait_type === "Milestones"
        );
        expect(milestonesAttr).to.exist;
        expect(milestonesAttr!.value).to.equal(3);
      });
    });

    describe("Commemorative Token Metadata", function () {
      const commemorativeData: CommemorativeData = {
        pledgeId: "pledge_12345678",
        campaignId: "campaign_abcd",
        campaignName: "Marathon Support",
        subjectName: "John Runner",
        beneficiaryName: "John Runner",
        backerName: "Alice Backer",
        backerAddress: "0x1234567890abcdef1234567890abcdef12345678",
        contributionAmount: "0.5",
        totalCampaignRaised: "10.0",
        pledgedAt: 1700000000,
        resolvedAt: 1702000000,
        outcomeSummary: "Completed marathon in 3:42:15",
        templateType: "generic"
      };

      it("should generate valid ERC-5192 metadata", function () {
        const metadata = metadataGenerator.generateCommemorativeMetadata(
          commemorativeData,
          "ar://ArTest123"
        );

        expect(metadata).to.have.property("name");
        expect(metadata).to.have.property("description");
        expect(metadata).to.have.property("image", "ar://ArTest123");
        expect(metadata.description).to.include("soulbound");
        expect(metadata.properties?.soulbound).to.be.true;
      });

      it("should include template-specific attributes for race_finish", function () {
        const raceData: RaceFinishData = {
          ...commemorativeData,
          templateType: "race_finish",
          customData: {
            raceName: "Boston Marathon",
            raceDate: "April 15, 2024",
            finishTime: "3:42:15",
            pace: "8:30",
            distance: "26.2 miles",
            bibNumber: "12345",
            runnerName: "John Runner"
          }
        };

        const metadata = metadataGenerator.generateCommemorativeMetadata(
          raceData,
          "ar://ArTest123"
        );

        const raceAttr = metadata.attributes.find(
          a => a.trait_type === "Race Name"
        );
        expect(raceAttr).to.exist;
        expect(raceAttr!.value).to.equal("Boston Marathon");

        const finishTimeAttr = metadata.attributes.find(
          a => a.trait_type === "Finish Time"
        );
        expect(finishTimeAttr).to.exist;
        expect(finishTimeAttr!.value).to.equal("3:42:15");
      });
    });

    describe("Metadata Validation", function () {
      it("should validate required fields", function () {
        const invalidMetadata = {
          name: "",
          description: "",
          image: "",
          attributes: []
        };

        const result = metadataGenerator.validateMetadata(invalidMetadata as any);

        expect(result.valid).to.be.false;
        expect(result.errors).to.include("name is required");
        expect(result.errors).to.include("description is required");
        expect(result.errors).to.include("image URI is required");
      });

      it("should validate URI formats", function () {
        const metadataWithInvalidUri = {
          name: "Test",
          description: "Test description",
          image: "not-a-valid-uri",
          attributes: []
        };

        const result = metadataGenerator.validateMetadata(metadataWithInvalidUri as any);

        expect(result.valid).to.be.false;
        expect(result.errors).to.include("image must be a valid URI");
      });

      it("should accept ipfs:// and ar:// URIs", function () {
        const metadataWithIpfs = {
          name: "Test",
          description: "Test description",
          image: "ipfs://QmTest123",
          attributes: []
        };

        const resultIpfs = metadataGenerator.validateMetadata(metadataWithIpfs as any);
        expect(resultIpfs.valid).to.be.true;

        const metadataWithAr = {
          name: "Test",
          description: "Test description",
          image: "ar://ArTest123",
          attributes: []
        };

        const resultAr = metadataGenerator.validateMetadata(metadataWithAr as any);
        expect(resultAr.valid).to.be.true;
      });
    });

    describe("Pledge Token Image Generation", function () {
      it("should generate pledge token placeholder SVG", function () {
        const pledgeData: PledgeTokenData = {
          pledgeId: "pledge_12345678",
          campaignId: "campaign_abcd",
          campaignName: "Test Campaign",
          backerAddress: "0x1234",
          pledgeAmount: "1.5",
          pledgeType: "flat",
          pledgedAt: 1700000000,
          status: "active"
        };

        const svg = metadataGenerator.generatePledgeTokenImage(pledgeData);

        expect(svg).to.include("PLEDGE PROTOCOL");
        expect(svg).to.include("1.5000 ETH");
        expect(svg).to.include("ACTIVE");
      });
    });
  });

  describe("Storage Service", function () {
    let storage: StorageService;

    beforeEach(function () {
      storage = new StorageService();
    });

    afterEach(function () {
      storage.clearCache();
    });

    describe("Mock Uploads", function () {
      it("should upload content to IPFS (mock)", async function () {
        const result = await storage.upload(
          "test content",
          "text/plain",
          "ipfs"
        );

        expect(result.provider).to.equal("ipfs");
        expect(result.uri).to.match(/^ipfs:\/\/Qm/);
        expect(result.hash).to.be.a("string");
        expect(result.timestamp).to.be.a("number");
      });

      it("should upload content to Arweave (mock)", async function () {
        const result = await storage.upload(
          "test content",
          "text/plain",
          "arweave"
        );

        expect(result.provider).to.equal("arweave");
        expect(result.uri).to.match(/^ar:\/\//);
        expect(result.hash).to.be.a("string");
      });

      it("should cache uploads", async function () {
        const content = "cached content";

        const result1 = await storage.upload(content, "text/plain", "ipfs");
        const result2 = await storage.upload(content, "text/plain", "ipfs");

        expect(result1.uri).to.equal(result2.uri);
        expect(result1.hash).to.equal(result2.hash);
      });
    });

    describe("URI Conversion", function () {
      it("should convert IPFS URI to HTTP URL", function () {
        const httpUrl = storage.toHttpUrl("ipfs://QmTest123");

        expect(httpUrl).to.equal("https://ipfs.io/ipfs/QmTest123");
      });

      it("should convert Arweave URI to HTTP URL", function () {
        const httpUrl = storage.toHttpUrl("ar://ArTest123");

        expect(httpUrl).to.equal("https://arweave.net/ArTest123");
      });

      it("should return HTTP URLs unchanged", function () {
        const url = "https://example.com/image.png";
        const result = storage.toHttpUrl(url);

        expect(result).to.equal(url);
      });
    });

    describe("Configuration", function () {
      it("should allow updating IPFS configuration", function () {
        storage.configureIPFS({
          gateway: "https://custom-gateway.io/ipfs"
        });

        const config = storage.getConfig();
        expect(config.ipfs.gateway).to.equal("https://custom-gateway.io/ipfs");
      });

      it("should allow changing preferred provider", function () {
        storage.setPreferredProvider("ipfs");
        const config = storage.getConfig();
        expect(config.preferredProvider).to.equal("ipfs");
      });
    });

    describe("Cache Management", function () {
      it("should report cache statistics", async function () {
        await storage.upload("content1", "text/plain", "ipfs");
        await storage.upload("content2", "text/plain", "ipfs");

        const stats = storage.getCacheStats();

        expect(stats.size).to.equal(2);
        expect(stats.entries).to.have.length(2);
      });

      it("should clear cache", async function () {
        await storage.upload("content", "text/plain", "ipfs");
        storage.clearCache();

        const stats = storage.getCacheStats();
        expect(stats.size).to.equal(0);
      });
    });
  });

  describe("Commemorative Service", function () {
    let service: CommemorativeService;

    beforeEach(function () {
      service = new CommemorativeService();
    });

    afterEach(function () {
      service.clearAll();
    });

    describe("Single Generation", function () {
      const request: GenerationRequest = {
        pledgeId: "pledge_12345678",
        campaignId: "campaign_abcd",
        campaignName: "Test Campaign",
        subjectName: "Test Subject",
        beneficiaryName: "Test Beneficiary",
        backerName: "Test Backer",
        backerAddress: "0x1234567890abcdef1234567890abcdef12345678",
        contributionAmount: "1.0",
        totalCampaignRaised: "10.0",
        pledgedAt: 1700000000,
        resolvedAt: 1702000000,
        outcomeSummary: "Successfully completed"
      };

      it("should generate a commemorative token", async function () {
        const result = await service.generateCommemorative(request);

        expect(result.success).to.be.true;
        expect(result.record).to.exist;
        expect(result.record!.pledgeId).to.equal(request.pledgeId);
        expect(result.record!.imageUri).to.match(/^(ipfs|ar):\/\//);
        expect(result.record!.metadataUri).to.match(/^(ipfs|ar):\/\//);
      });

      it("should return existing record on duplicate generation", async function () {
        const result1 = await service.generateCommemorative(request);
        const result2 = await service.generateCommemorative(request);

        expect(result1.record!.id).to.equal(result2.record!.id);
      });

      it("should emit events during generation", async function () {
        let startedEmitted = false;
        let completedEmitted = false;

        service.on("generation:started", () => { startedEmitted = true; });
        service.on("generation:completed", () => { completedEmitted = true; });

        await service.generateCommemorative(request);

        expect(startedEmitted).to.be.true;
        expect(completedEmitted).to.be.true;
      });
    });

    describe("Campaign Batch Generation", function () {
      const campaignRequest: CampaignGenerationRequest = {
        campaignId: "campaign_batch",
        campaignName: "Batch Test Campaign",
        subjectName: "Batch Subject",
        beneficiaryName: "Batch Beneficiary",
        totalRaised: "100.0",
        resolvedAt: 1702000000,
        outcomeSummary: "Batch completed",
        pledges: [
          {
            pledgeId: "pledge_1",
            backerName: "Backer 1",
            backerAddress: "0x1111111111111111111111111111111111111111",
            contributionAmount: "10.0",
            pledgedAt: 1700000000
          },
          {
            pledgeId: "pledge_2",
            backerName: "Backer 2",
            backerAddress: "0x2222222222222222222222222222222222222222",
            contributionAmount: "20.0",
            pledgedAt: 1700000001
          },
          {
            pledgeId: "pledge_3",
            backerName: "Backer 3",
            backerAddress: "0x3333333333333333333333333333333333333333",
            contributionAmount: "30.0",
            pledgedAt: 1700000002
          }
        ]
      };

      it("should generate commemoratives for all pledges", async function () {
        const results = await service.generateForCampaign(campaignRequest);

        expect(results).to.have.length(3);
        expect(results.every(r => r.success)).to.be.true;
      });

      it("should emit batch events", async function () {
        let batchStarted = false;
        let progressEvents = 0;
        let batchCompleted = false;

        service.on("batch:started", () => { batchStarted = true; });
        service.on("batch:progress", () => { progressEvents++; });
        service.on("batch:completed", () => { batchCompleted = true; });

        await service.generateForCampaign(campaignRequest);

        expect(batchStarted).to.be.true;
        expect(progressEvents).to.equal(3);
        expect(batchCompleted).to.be.true;
      });
    });

    describe("Record Queries", function () {
      beforeEach(async function () {
        await service.generateCommemorative({
          pledgeId: "pledge_query1",
          campaignId: "campaign_query",
          campaignName: "Query Campaign",
          subjectName: "Subject",
          beneficiaryName: "Beneficiary",
          backerName: "Backer",
          backerAddress: "0xaaaa000000000000000000000000000000000001",
          contributionAmount: "1.0",
          totalCampaignRaised: "10.0",
          pledgedAt: 1700000000,
          resolvedAt: 1702000000,
          outcomeSummary: "Completed"
        });

        await service.generateCommemorative({
          pledgeId: "pledge_query2",
          campaignId: "campaign_query",
          campaignName: "Query Campaign",
          subjectName: "Subject",
          beneficiaryName: "Beneficiary",
          backerName: "Backer 2",
          backerAddress: "0xaaaa000000000000000000000000000000000002",
          contributionAmount: "2.0",
          totalCampaignRaised: "10.0",
          pledgedAt: 1700000001,
          resolvedAt: 1702000000,
          outcomeSummary: "Completed"
        });
      });

      it("should get record by pledge ID", function () {
        const record = service.getByPledgeId("pledge_query1");

        expect(record).to.exist;
        expect(record!.pledgeId).to.equal("pledge_query1");
      });

      it("should get all records for a campaign", function () {
        const records = service.getByCampaignId("campaign_query");

        expect(records).to.have.length(2);
      });

      it("should get records by backer address", function () {
        const records = service.getByBackerAddress(
          "0xaaaa000000000000000000000000000000000001"
        );

        expect(records).to.have.length(1);
        expect(records[0].pledgeId).to.equal("pledge_query1");
      });

      it("should return empty array for unknown campaign", function () {
        const records = service.getByCampaignId("unknown_campaign");
        expect(records).to.have.length(0);
      });
    });

    describe("Minting Status", function () {
      it("should mark commemorative as minted", async function () {
        await service.generateCommemorative({
          pledgeId: "pledge_mint",
          campaignId: "campaign_mint",
          campaignName: "Mint Campaign",
          subjectName: "Subject",
          beneficiaryName: "Beneficiary",
          backerName: "Backer",
          backerAddress: "0xbbbb000000000000000000000000000000000001",
          contributionAmount: "1.0",
          totalCampaignRaised: "10.0",
          pledgedAt: 1700000000,
          resolvedAt: 1702000000,
          outcomeSummary: "Completed"
        });

        const success = service.markAsMinted(
          "pledge_mint",
          12345,
          "0xhash123"
        );

        expect(success).to.be.true;

        const record = service.getByPledgeId("pledge_mint");
        expect(record!.minted).to.be.true;
        expect(record!.tokenId).to.equal(12345);
        expect(record!.txHash).to.equal("0xhash123");
        expect(record!.mintedAt).to.be.a("number");
      });

      it("should return false for unknown pledge", function () {
        const success = service.markAsMinted("unknown_pledge", 1, "0xhash");
        expect(success).to.be.false;
      });
    });

    describe("Statistics", function () {
      beforeEach(async function () {
        await service.generateCommemorative({
          pledgeId: "pledge_stats1",
          campaignId: "campaign_stats",
          campaignName: "Stats Campaign",
          subjectName: "Subject",
          beneficiaryName: "Beneficiary",
          backerName: "Backer",
          backerAddress: "0xcccc000000000000000000000000000000000001",
          contributionAmount: "1.0",
          totalCampaignRaised: "10.0",
          pledgedAt: 1700000000,
          resolvedAt: 1702000000,
          outcomeSummary: "Completed"
        });

        await service.generateCommemorative({
          pledgeId: "pledge_stats2",
          campaignId: "campaign_stats",
          campaignName: "Stats Campaign",
          subjectName: "Subject",
          beneficiaryName: "Beneficiary",
          backerName: "Backer 2",
          backerAddress: "0xcccc000000000000000000000000000000000002",
          contributionAmount: "2.0",
          totalCampaignRaised: "10.0",
          pledgedAt: 1700000001,
          resolvedAt: 1702000000,
          outcomeSummary: "Completed"
        });

        service.markAsMinted("pledge_stats1", 1, "0xhash1");
      });

      it("should return accurate statistics", function () {
        const stats = service.getStats();

        expect(stats.totalRecords).to.equal(2);
        expect(stats.minted).to.equal(1);
        expect(stats.unminted).to.equal(1);
        expect(stats.byCampaign.get("campaign_stats")).to.equal(2);
      });
    });
  });

  describe("Pledge Token Service", function () {
    let service: PledgeTokenService;

    beforeEach(function () {
      service = new PledgeTokenService();
    });

    afterEach(function () {
      service.clearAll();
    });

    describe("Token Metadata Generation", function () {
      const pledgeData: PledgeTokenData = {
        pledgeId: "pledge_token_test",
        campaignId: "campaign_token",
        campaignName: "Token Test Campaign",
        backerAddress: "0xdddd000000000000000000000000000000000001",
        pledgeAmount: "5.0",
        pledgeType: "flat",
        pledgedAt: 1700000000,
        status: "active"
      };

      it("should generate pledge token metadata", async function () {
        const result = await service.generatePledgeTokenMetadata(pledgeData);

        expect(result.metadata).to.exist;
        expect(result.imageUri).to.match(/^(ipfs|ar):\/\//);
        expect(result.metadataUri).to.match(/^(ipfs|ar):\/\//);
      });

      it("should cache generated metadata", async function () {
        const result1 = await service.generatePledgeTokenMetadata(pledgeData);
        const result2 = await service.generatePledgeTokenMetadata(pledgeData);

        expect(result1.imageUri).to.equal(result2.imageUri);
        expect(result1.metadataUri).to.equal(result2.metadataUri);
      });

      it("should return stored metadata", async function () {
        await service.generatePledgeTokenMetadata(pledgeData);

        const stored = service.getPledgeTokenMetadata(pledgeData.pledgeId);

        expect(stored).to.exist;
        expect(stored!.metadata.name).to.include("Token Test Campaign");
      });
    });

    describe("URL Retrieval", function () {
      beforeEach(async function () {
        await service.generatePledgeTokenMetadata({
          pledgeId: "pledge_url_test",
          campaignId: "campaign_url",
          campaignName: "URL Test",
          backerAddress: "0xeeee",
          pledgeAmount: "1.0",
          pledgeType: "flat",
          pledgedAt: 1700000000,
          status: "active"
        });
      });

      it("should return metadata URL", function () {
        const url = service.getMetadataUrl("pledge_url_test");

        expect(url).to.be.a("string");
        expect(url).to.match(/^https:\/\//);
      });

      it("should return image URL", function () {
        const url = service.getImageUrl("pledge_url_test");

        expect(url).to.be.a("string");
        expect(url).to.match(/^https:\/\//);
      });

      it("should return undefined for unknown pledge", function () {
        const url = service.getMetadataUrl("unknown_pledge");
        expect(url).to.be.undefined;
      });
    });
  });
});
