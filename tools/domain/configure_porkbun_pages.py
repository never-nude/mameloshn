#!/usr/bin/env python3
"""Plan or apply Porkbun DNS records for yiddish.wiki on GitHub Pages.

The script is read-only unless --apply is supplied. Credentials are read from
PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY and are never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid


DOMAIN = "yiddish.wiki"
API_BASE = "https://api.porkbun.com/api/json/v3"
TTL = 600
GITHUB_PAGES_V4 = (
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
)
GITHUB_PAGES_V6 = (
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
)
GITHUB_PAGES_CNAME = "never-nude.github.io"
VERIFY_LABEL = "_github-pages-challenge-never-nude"
PORKBUN_PARKING_CNAME = "pixie.porkbun.com"


def normalized_content(record_type: str, content: str) -> str:
    value = content.strip()
    if record_type in {"CNAME", "ALIAS", "ANAME"}:
        return value.rstrip(".").lower()
    return value


def record_label(name: str) -> str:
    value = name.strip().rstrip(".").lower()
    if value in {"", DOMAIN}:
        return ""
    suffix = f".{DOMAIN}"
    if value.endswith(suffix):
        return value[: -len(suffix)]
    return value


def record_key(record: dict[str, object]) -> tuple[str, str, str]:
    record_type = str(record.get("type", "")).upper()
    return (
        record_label(str(record.get("name", ""))),
        record_type,
        normalized_content(record_type, str(record.get("content", ""))),
    )


def wanted_records(phase: str, verification_token: str | None) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    if phase in {"host", "all"}:
        records.extend(
            {"name": "", "type": "A", "content": value, "ttl": TTL}
            for value in GITHUB_PAGES_V4
        )
        records.extend(
            {"name": "", "type": "AAAA", "content": value, "ttl": TTL}
            for value in GITHUB_PAGES_V6
        )
        records.append(
            {
                "name": "www",
                "type": "CNAME",
                "content": GITHUB_PAGES_CNAME,
                "ttl": TTL,
            }
        )
    if phase in {"verify", "all"}:
        if not verification_token:
            raise ValueError(
                "The verify phase requires --verification-token or "
                "GITHUB_PAGES_VERIFICATION_TOKEN."
            )
        records.append(
            {
                "name": VERIFY_LABEL,
                "type": "TXT",
                "content": verification_token,
                "ttl": TTL,
            }
        )
    return records


class Porkbun:
    def __init__(self) -> None:
        self.api_key = os.environ.get("PORKBUN_API_KEY", "")
        self.secret_key = os.environ.get("PORKBUN_SECRET_API_KEY", "")
        if not self.api_key or not self.secret_key:
            raise RuntimeError(
                "Set PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY in the shell first."
            )

    def request(
        self, path: str, *, method: str = "GET", payload: dict[str, object] | None = None
    ) -> dict[str, object]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Secret-API-Key": self.secret_key,
        }
        body = None
        if method != "GET":
            authenticated_payload = {
                "apikey": self.api_key,
                "secretapikey": self.secret_key,
                **(payload or {}),
            }
            body = json.dumps(authenticated_payload).encode("utf-8")
            headers["Idempotency-Key"] = str(uuid.uuid4())
        request = urllib.request.Request(
            f"{API_BASE}{path}", data=body, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            response_text = error.read().decode("utf-8", "replace")
            raise RuntimeError(f"Porkbun returned HTTP {error.code}: {response_text}") from error
        if result.get("status") != "SUCCESS":
            message = result.get("message") or result.get("code") or "unknown API error"
            raise RuntimeError(f"Porkbun request failed: {message}")
        return result

    def retrieve(self) -> list[dict[str, object]]:
        result = self.request(f"/dns/retrieve/{DOMAIN}")
        records = result.get("records", [])
        if not isinstance(records, list):
            raise RuntimeError("Porkbun returned an unexpected DNS response.")
        return records

    def create(self, record: dict[str, object], *, dry_run: bool = False) -> None:
        payload = {**record, "dryRun": dry_run}
        self.request(f"/dns/create/{DOMAIN}", method="POST", payload=payload)

    def edit(self, record_id: str, record: dict[str, object]) -> None:
        self.request(f"/dns/edit/{DOMAIN}/{record_id}", method="POST", payload=record)

    def delete(self, record_id: str) -> None:
        self.request(f"/dns/delete/{DOMAIN}/{record_id}", method="POST", payload={})


def conflicts_with_pages(record: dict[str, object], phase: str) -> bool:
    label, record_type, content = record_key(record)
    if label == "*" and record_type == "CNAME" and content == PORKBUN_PARKING_CNAME:
        return True
    if phase not in {"host", "all"}:
        return False
    if label == "" and record_type in {"A", "AAAA", "CNAME", "ALIAS", "ANAME"}:
        return True
    if label == "www" and record_type in {"A", "AAAA", "CNAME", "ALIAS", "ANAME"}:
        return True
    return False


def wildcard_requires_manual_review(record: dict[str, object]) -> bool:
    label, record_type, content = record_key(record)
    if label != "*":
        return False
    return not (record_type == "CNAME" and content == PORKBUN_PARKING_CNAME)


def describe(record: dict[str, object]) -> str:
    label, record_type, content = record_key(record)
    return f"{record_type:5} {label or '@':38} {content}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Plan or apply yiddish.wiki DNS for GitHub Pages."
    )
    parser.add_argument("--phase", choices=("verify", "host", "all"), default="host")
    parser.add_argument("--apply", action="store_true", help="Perform the displayed changes.")
    parser.add_argument(
        "--verification-token",
        default=os.environ.get("GITHUB_PAGES_VERIFICATION_TOKEN"),
        help="GitHub's TXT challenge value; may also come from GITHUB_PAGES_VERIFICATION_TOKEN.",
    )
    args = parser.parse_args()

    try:
        desired = wanted_records(args.phase, args.verification_token)
        client = Porkbun()
        current = client.retrieve()
    except (RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    desired_keys = {record_key(record) for record in desired}
    current_keys = {record_key(record) for record in current}
    deletions = [
        record
        for record in current
        if conflicts_with_pages(record, args.phase) and record_key(record) not in desired_keys
    ]
    creations = [record for record in desired if record_key(record) not in current_keys]
    edits: list[tuple[dict[str, object], dict[str, object]]] = []

    # Reuse an existing record at the same label/type where possible. This turns
    # Porkbun's parked apex A and www CNAME records into GitHub records without a
    # delete/create gap.
    for old_record in list(deletions):
        old_label, old_type, _ = record_key(old_record)
        if old_label == "*":
            continue
        replacement = next(
            (
                record
                for record in creations
                if record_key(record)[:2] == (old_label, old_type)
            ),
            None,
        )
        if replacement is None:
            continue
        edits.append((old_record, replacement))
        deletions.remove(old_record)
        creations.remove(replacement)

    unexpected_wildcards = [record for record in current if wildcard_requires_manual_review(record)]

    print(f"DNS plan for {DOMAIN} ({args.phase} phase):")
    for old_record, new_record in edits:
        print(f"  UPDATE {describe(old_record)}")
        print(f"      TO {describe(new_record)}")
    for record in deletions:
        print(f"  DELETE {describe(record)}")
    for record in creations:
        print(f"  CREATE {describe(record)}")
    if unexpected_wildcards:
        print("\n  MANUAL REVIEW REQUIRED: unexpected wildcard records exist:")
        for record in unexpected_wildcards:
            print(f"    {describe(record)}")
    if not edits and not deletions and not creations:
        print("  No changes needed.")

    if not args.apply:
        print("\nRead-only plan. Re-run with --apply after reviewing it.")
        return 0


    if unexpected_wildcards:
        print(
            "error: refusing to apply while unexpected wildcard records exist; "
            "review them in Porkbun first.",
            file=sys.stderr,
        )
        return 3

    records_without_ids = [
        record
        for record in deletions + [old_record for old_record, _ in edits]
        if not str(record.get("id", ""))
    ]
    if records_without_ids:
        print("error: Porkbun returned a mutable record without an ID; no writes made.", file=sys.stderr)
        return 3

    try:
        # Validate every create before making the first write.
        for record in creations:
            client.create(record, dry_run=True)

        # Add records that can coexist with parking, then edit matching records,
        # and only then remove leftovers such as the known parking wildcard.
        for record in creations:
            client.create(record)
            print(f"Created {describe(record)}")
        for old_record, new_record in edits:
            client.edit(str(old_record["id"]), new_record)
            print(f"Updated {describe(old_record)} -> {describe(new_record)}")
        for record in deletions:
            client.delete(str(record["id"]))
            print(f"Deleted {describe(record)}")

        resulting_records = client.retrieve()
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        print(
            "DNS may be partially updated. Re-run without --apply to inspect it; "
            "Porkbun zone history can restore the previous state.",
            file=sys.stderr,
        )
        return 4

    resulting_keys = {record_key(record) for record in resulting_records}
    missing = desired_keys - resulting_keys
    remaining_conflicts = [
        record
        for record in resulting_records
        if conflicts_with_pages(record, args.phase) and record_key(record) not in desired_keys
    ]
    if missing or remaining_conflicts:
        print("error: DNS did not converge to the requested state.", file=sys.stderr)
        for key in sorted(missing):
            print(f"  missing: {key}", file=sys.stderr)
        for record in remaining_conflicts:
            print(f"  conflict: {describe(record)}", file=sys.stderr)
        return 5

    print("DNS now matches the requested phase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
