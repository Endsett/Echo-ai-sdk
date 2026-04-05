# Changelog

All notable changes to this project will be documented in this file.

## [2.8.0] - 2026-04-05

### Fixed
- Fixed ESLint errors by replacing @ts-ignore with @ts-expect-error in anthropic.ts
- Removed @ts-nocheck from azure_openai.ts and updated to use Azure OpenAI v2 API
- Fixed all unused variable warnings across source and test files
- Updated CI/CD tests to match actual workflow implementation (release-triggered publishing)
- Fixed Azure OpenAI provider to use the new AzureOpenAI class from the openai package
- Updated test mocks to properly mock the Azure OpenAI v2 API

### Added
- **Retry Logic**: Integrated exponential backoff retry logic in all cloud providers (AWS Bedrock, Azure OpenAI, GCP Vertex)
- **Enhanced Error Messages**: Added contextual error messages with troubleshooting hints for all providers
- **Comprehensive JSDoc Documentation**: Added detailed API documentation with examples for EchoAI client and AIModelGateway
- **Debug Logging**: Enhanced logger with performance timing, request/response logging, and debug mode support
- **Test Coverage**: Added comprehensive tests for retry logic and error handling

### Changed
- Upgraded Azure OpenAI integration to use the latest v2.0.0 API
- Improved type safety throughout the codebase
- Enhanced developer experience with better error messages and documentation

### Dependencies
- No dependency changes, only internal code improvements

## [2.7.0] - Previous
- Previous version features
