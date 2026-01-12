# Pledge Protocol

Milestone-verified crowdfunding with commemorative proof of backing. A NatLangChain application.

## What This Does

You pledge money toward someone's goal. The money locks in escrow. When verified milestones are hit, funds release to the beneficiary. You get permanent proof you backed them.

No more "I'll pay you when you finish" followed by silence. No more crowdfunding campaigns that take money and disappear. Pledge Protocol makes commitments binding and outcomes verifiable.

## How It Works

```
1. Campaign created (marathon, album, degree, product launch)
2. Milestones defined with verification sources
3. Backers purchase pledge tokens (funds go to escrow)
4. Event happens
5. Oracle confirms milestone completion
6. Funds release to beneficiary
7. Backers receive commemorative tokens proving their support
```

Money moves when reality moves. Not before.

## The Pledge Token

When you back a campaign, you receive a pledge token representing your commitment:

```
PLEDGE #0047
Campaign: Sarah's Portland Marathon 2026
Backer: Mike
Beneficiary: Portland Habitat for Humanity

Commitment: $2.00 per mile, max $60.00
Escrowed: $60.00
Status: Active

Resolution: Pending official race results
```

This token is yours. It represents your stake in the outcome.

## The Commemorative Token

After resolution, your pledge token transforms into permanent proof:

```
COMMEMORATIVE #0047
Campaign: Sarah's Portland Marathon 2026
Backer: Mike
Beneficiary: Portland Habitat for Humanity

Runner Result: 26.2 miles, 3:47:22
Your Contribution: $52.40
Total Campaign Raised: $2,847.00

Backed: March 15, 2026
Resolved: April 7, 2026
```

This is your receipt, your bragging rights, your proof of being early.

## Use Cases

### Charity Runs

Sponsor a runner. Pledge per mile, per lap, or flat amount for completion. Funds release automatically when official race results post. No chasing sponsors for payment. No honor system.

### Education

Back a student's degree. Funds release on enrollment verification, semester completion, graduation. Hold proof that you funded someone's future.

### Creative Work

Fund an album, film, or book. Escrow releases at milestones: demo complete, rough cut delivered, final master, public release. Backers know funds move only as work progresses.

### Open Source Development

Fund a feature or bug fix. Release tied to PR merged, tests passing, deployment complete. Token shows you funded commit #a7f2b4c.

### Research

Back a study. Milestones: IRB approval, data collection, peer review, publication. Proof you supported science before the results were known.

### Small Business Launch

Fund a food cart, workshop, studio. Releases on permits secured, equipment purchased, doors open. Founding supporter status, verifiable forever.

### Personal Goals

Sponsor recovery, fitness, skill acquisition. Milestones verified by agreed-upon methods. Dignified backing with real accountability.

## Why This Matters

Current crowdfunding is broken:

**Kickstarter model**: Money collected upfront, delivered maybe never. Backers have no recourse. Creators have no accountability mechanism.

**GoFundMe model**: Give money on faith. No verification of use. Commemorated only in your bank statement.

**Charity pledge model**: Promise to pay later. 40% of pledges never collected. Friction everywhere.

Pledge Protocol fixes the incentives:

- Backers pay upfront, but funds are escrowed, not transferred
- Releases happen only when verified milestones complete
- Unmet milestones return funds to backers
- Everyone gets permanent proof of participation

Trust is replaced with verification.

## Protocol Components

### Campaign Contract

Defines the goal, beneficiary, milestones, and verification sources.

```
Campaign: Portland Marathon 2026 - Sarah Chen
Beneficiary: Portland Habitat for Humanity
Runner: Sarah Chen (Bib #4471)

Milestones:
  - Race completion: Official results API
  - Time verification: Official results API
  
Pledge Types:
  - Per mile: $X per mile completed
  - Completion bonus: $X if finishes
  - Time bonus: $X if under target time
  
Campaign Window: March 1 - April 6, 2026
Resolution Deadline: April 14, 2026
```

### Pledge Token

Individual backer's commitment, held in their wallet.

### Oracle Registry

Verified data sources that trigger milestone completion:

- Race timing APIs
- Academic registrar verification
- GitHub commit history
- Streaming platform release dates
- Business license databases
- Custom attestation from trusted parties

### Escrow Contract

Holds funds until resolution. Releases to beneficiary on milestone completion, returns to backer on milestone failure or campaign expiration.

### Commemorative Mint

Transforms resolved pledges into permanent collectible tokens.

## NatLangChain Integration

Pledge Protocol is built on NatLangChain, inheriting:

- **Human-readable contracts**: Pledges are written in plain language, executable by machines
- **Intent verification**: The commitment you made is auditable and immutable
- **Provenance tracking**: Full history of campaign creation, pledge, resolution
- **Authenticity proofs**: Your commemorative token is verifiably tied to the real event

A pledge is a NatLangChain contract. The prose is the program.

## For Campaign Organizers

Setting up a Pledge Protocol campaign requires:

1. **Define the campaign**: Goal, beneficiary wallet, timeline
2. **Specify milestones**: What gets verified, by what source
3. **Configure pledge types**: Per-unit, flat, bonus conditions
4. **Register oracles**: Connect verification data sources
5. **Deploy contracts**: Launch on NatLangChain
6. **Distribute pledge access**: Runners/creators share their campaign links
7. **Resolution**: Oracle data triggers automatic fund distribution

Technical integration required. This is protocol infrastructure, not a consumer app. Organizers partner with developers or use hosted implementations.

## For Backers

1. Find a campaign (shared by runner, creator, student)
2. Choose pledge type and amount
3. Purchase pledge token (funds go to escrow)
4. Watch progress (optional: live updates)
5. Resolution happens automatically
6. Receive commemorative token

Your money moves when the milestone is verified. Not before.

## For Beneficiaries

Funds arrive automatically when milestones complete. No invoicing sponsors. No chasing payments. No awkward conversations about who forgot to pay.

Focus on the goal. The protocol handles the money.

## Privacy Considerations

- Campaigns can be public or private
- Backer identity can be wallet-only (pseudonymous) or linked to real identity
- Pledge amounts can be hidden until resolution
- Commemorative tokens can be non-transferable (soulbound) to prevent resale

Configuration per campaign. Different use cases need different privacy levels.

## What This Isn't

- Not a donation platform (funds are escrowed, not given)
- Not a betting market (backers don't profit from outcomes)
- Not equity crowdfunding (no ownership stake in ventures)
- Not a payment processor (settlement happens on-chain)

This is commitment infrastructure. Making pledges real.

## Built On

- **NatLangChain**: Prose-first smart contracts
- **IPFS/Arweave**: Permanent storage of campaign data and commemoratives
- **Oracle networks**: Verified external data sources

## License

[TBD]

## Contributing

[TBD]
