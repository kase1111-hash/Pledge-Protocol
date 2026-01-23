# Security Policy

## Reporting Security Vulnerabilities

The Pledge Protocol team takes security seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing the maintainers directly. You can find contact information in the repository or reach out through GitHub's private security advisory feature.

When reporting a vulnerability, please include:

1. **Description**: A clear description of the vulnerability
2. **Impact**: The potential impact and severity
3. **Steps to Reproduce**: Detailed steps to reproduce the issue
4. **Proof of Concept**: Code or screenshots demonstrating the vulnerability (if applicable)
5. **Suggested Fix**: Any recommendations for fixing the issue (if you have them)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Assessment**: We will assess the vulnerability and determine its severity
- **Updates**: We will keep you informed of our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 7 days
- **Credit**: We will credit you in our release notes (unless you prefer to remain anonymous)

## Scope

### In Scope

- Smart contracts in the `contracts/` directory
- API server code in `src/api/`
- Oracle providers in `src/oracle/`
- Token system in `src/tokens/`
- Authentication and authorization in `src/security/`
- Payment processing in `src/payments/`
- Any code that handles user funds or sensitive data

### Out of Scope

- Issues in dependencies (report to the respective maintainers)
- Social engineering attacks
- Physical attacks
- Issues requiring unlikely user interaction
- Issues in third-party services we integrate with

## Security Measures

### Smart Contract Security

- All contracts use OpenZeppelin's audited implementations
- Reentrancy guards on all external calls that transfer funds
- Access control using OpenZeppelin's Ownable and AccessControl
- Integer overflow protection (Solidity 0.8.x built-in)
- Careful handling of external calls and return values
- Comprehensive test coverage

### API Security

- Wallet-based authentication with signature verification
- Session management with secure tokens
- Rate limiting to prevent abuse
- Input validation using Zod schemas
- SQL injection prevention through parameterized queries
- XSS prevention through proper output encoding

### Fund Security

- Escrow pattern: funds are held in contract, not transferred immediately
- Multi-sig support for high-value operations
- Time-locks on critical operations
- Oracle verification before fund release
- Refund mechanisms for failed campaigns

### Data Security

- GDPR and CCPA compliance tools
- Data encryption at rest and in transit
- Minimal data collection principles
- Secure handling of API keys and secrets
- Audit logging for sensitive operations

## Best Practices for Users

### For Developers

- Never commit private keys or secrets to the repository
- Use environment variables for sensitive configuration
- Keep dependencies updated
- Review security advisories regularly
- Test on testnets before mainnet deployment

### For Campaign Creators

- Verify oracle configurations before launching campaigns
- Use reputable oracle data sources
- Set reasonable deadlines and caps
- Monitor campaigns for unusual activity

### For Backers

- Verify campaign legitimacy before pledging
- Understand the escrow and refund mechanisms
- Keep wallet software updated
- Be cautious of phishing attempts

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Updates

Security updates will be released as patch versions and announced through:

- GitHub Security Advisories
- Release notes in CHANGELOG.md

## Bug Bounty

We are considering implementing a bug bounty program for critical vulnerabilities. Please reach out if you're interested in participating.

## Acknowledgments

We thank all security researchers who help keep Pledge Protocol secure. Contributors who report valid security issues will be acknowledged in our release notes (with permission).

---

Thank you for helping keep Pledge Protocol and its users safe!
