# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

This package provides browser automation capabilities, including Cloudflare Turnstile interaction. By design, it interacts with anti-bot systems, which may be perceived as a security risk.

If you discover a security vulnerability in this package (e.g., code execution, credential leakage, dependency compromise), please report it privately:

- **Email**: [riefaprilioh@gmail.com](mailto:riefaprilioh@gmail.com)
- **GitHub**: Open a [draft security advisory](https://github.com/Difz25x/patchright-difz/security/advisories/new)

We aim to respond within 48 hours.

## Responsible Use

This package is intended **only** for:
- Automated testing of your own web properties
- Authorized security assessments and penetration tests
- Security research conducted in compliance with applicable law

Using this package to bypass Cloudflare Turnstile or other challenge systems without authorization may violate:
- Computer Fraud and Abuse Act (CFAA) and similar laws worldwide
- Cloudflare Terms of Service
- Website Terms of Service

The maintainers are not responsible for misuse of this package.

## Dependency Security

This package depends on `patchright` (a Playwright fork). We recommend keeping dependencies up to date. Run `npm audit` regularly.
