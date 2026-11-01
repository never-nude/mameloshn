# yiddish.wiki DNS setup

This helper configures Porkbun DNS without placing credentials in the repository. It is read-only unless `--apply` is supplied.

Before activating the custom domain, export any Family Words/progress that must be preserved. Browser storage belongs to the old `never-nude.github.io` origin and cannot move automatically to `yiddish.wiki`; import the backup after the switch.

Set a domain-scoped Porkbun key without placing its value in shell history:

```sh
read -r "PORKBUN_API_KEY?Porkbun API key: "
read -rs "PORKBUN_SECRET_API_KEY?Porkbun secret API key: "; echo
export PORKBUN_API_KEY PORKBUN_SECRET_API_KEY
```

The Porkbun key must have DNS permission for `yiddish.wiki`, and API access must be enabled for the domain.

For GitHub account-level verification, first obtain the TXT challenge from GitHub profile **Settings → Pages**, then run:

```sh
python3 tools/domain/configure_porkbun_pages.py \
  --phase verify \
  --verification-token 'GITHUB_CHALLENGE_VALUE'

# Review the plan, then repeat with --apply.
```

After GitHub confirms the domain, preview the hosting records:

```sh
python3 tools/domain/configure_porkbun_pages.py --phase host

# Review the plan, then repeat with --apply.
```

The host phase removes conflicting apex, `www`, and wildcard records, then creates GitHub Pages' four A records, four AAAA records, and `www CNAME never-nude.github.io`. Unrelated MX, TXT, and CAA records are preserved.

Once the repository change containing `docs/CNAME` is on `main`, attach the domain from the terminal immediately before applying the host phase:

```sh
gh api --method PUT repos/never-nude/mameloshn/pages -f cname=yiddish.wiki
python3 tools/domain/configure_porkbun_pages.py --phase host --apply
```

Then poll GitHub's DNS and certificate state:

```sh
gh api repos/never-nude/mameloshn/pages/health
gh api repos/never-nude/mameloshn/pages \
  --jq '{cname,html_url,protected_domain_state,https_certificate,https_enforced}'
```

After the certificate is approved, enforce HTTPS:

```sh
gh api --method PUT repos/never-nude/mameloshn/pages -F https_enforced=true
```

When finished, remove the credentials from the shell environment:

```sh
unset PORKBUN_API_KEY PORKBUN_SECRET_API_KEY
```
