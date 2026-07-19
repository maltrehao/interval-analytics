# Security Policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities in public issues. Use GitHub's
private vulnerability reporting feature when it is enabled for this repository.

Include the affected path, reproduction steps, potential impact, and any
suggested mitigation. Do not include real account tokens, private portfolio
data, or other sensitive information in the report.

## Data and credentials

This project has no application login and requires no account, password, token,
or private API key. All supported searches and market-data requests use public
endpoints. Do not commit `.env` files, access tokens, account data, or
proprietary market data. The repository `.gitignore` excludes environment files
by default.
