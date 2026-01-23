# Contributing to Pledge Protocol

Thank you for your interest in contributing to Pledge Protocol! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Smart Contract Development](#smart-contract-development)
- [Reporting Issues](#reporting-issues)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Pledge-Protocol.git
   cd Pledge-Protocol
   ```
3. Add the upstream repository as a remote:
   ```bash
   git remote add upstream https://github.com/kase1111-hash/Pledge-Protocol.git
   ```

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Compile smart contracts
npm run compile

# Run tests to verify setup
npm test
```

### Running Locally

```bash
# Start local Hardhat node
npm run node

# In a new terminal, deploy contracts locally
npm run deploy:local

# Start API server in development mode
npm run api:dev
```

## How to Contribute

### Types of Contributions

- **Bug fixes**: Fix issues in the codebase
- **Features**: Add new functionality (discuss first via issue)
- **Documentation**: Improve docs, fix typos, add examples
- **Tests**: Add or improve test coverage
- **Security**: Report vulnerabilities (see [SECURITY.md](SECURITY.md))

### Contribution Workflow

1. Check existing issues or create a new one to discuss your contribution
2. Fork the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following our code style guidelines
4. Write or update tests as needed
5. Ensure all tests pass: `npm test`
6. Run the linter: `npm run lint`
7. Commit your changes with a clear message
8. Push to your fork and submit a pull request

## Code Style

### TypeScript

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Run `npm run lint` before committing
- Run `npm run format` to auto-format code

### Solidity

- Target Solidity 0.8.24
- Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use NatSpec comments for all public functions
- Prefer OpenZeppelin contracts for standard functionality
- Optimize for gas efficiency where possible

### Commit Messages

Use clear, descriptive commit messages:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(oracle): add Strava activity provider`
- `fix(escrow): handle edge case in refund calculation`
- `docs(api): update webhook documentation`

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx hardhat test test/CampaignRegistry.test.ts
```

### Writing Tests

- Place test files in the `test/` directory
- Name test files with `.test.ts` suffix
- Test both success and failure cases
- Test edge cases and boundary conditions
- For smart contracts, test gas usage for critical functions

### Test Structure

```typescript
describe("ComponentName", () => {
  describe("functionName", () => {
    it("should do expected behavior", async () => {
      // Arrange
      // Act
      // Assert
    });

    it("should handle error case", async () => {
      // Test failure scenario
    });
  });
});
```

## Pull Request Process

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Testing**: Describe how you tested your changes
4. **Checklist**:
   - [ ] Tests pass locally
   - [ ] Linting passes
   - [ ] Documentation updated (if needed)
   - [ ] No breaking changes (or clearly documented)

### Review Process

- All PRs require at least one review
- Address review feedback promptly
- Keep PRs focused on a single concern
- Large features should be split into smaller PRs

## Smart Contract Development

### Security Considerations

- Follow the [Smart Contract Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- Be aware of common vulnerabilities (reentrancy, overflow, etc.)
- Use OpenZeppelin's battle-tested contracts
- Consider gas optimization without sacrificing security
- All contract changes require security review

### Testing Smart Contracts

- Write comprehensive unit tests
- Test access control and permissions
- Test failure modes and reverts
- Test with different account types (owner, user, attacker)
- Verify gas costs for critical operations

### Deployment

- Never commit private keys or secrets
- Use environment variables for sensitive data
- Test on testnet before mainnet deployment
- Document deployment steps

## Reporting Issues

### Bug Reports

When reporting bugs, include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS, etc.)
- Relevant logs or error messages

### Feature Requests

When requesting features, include:

- Clear description of the feature
- Use case and motivation
- Proposed implementation (if any)
- Potential impact on existing functionality

## Questions?

If you have questions about contributing, feel free to:

- Open a GitHub issue for discussion
- Review existing issues and PRs for context

Thank you for contributing to Pledge Protocol!
