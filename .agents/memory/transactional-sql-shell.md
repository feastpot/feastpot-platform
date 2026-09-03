---
name: Transactional SQL from shell
description: Prevent shell expansion from corrupting PostgreSQL transaction scripts
---

When constructing a production SQL script in the shell, use a single-quoted heredoc whenever the script contains PostgreSQL dollar-quoted blocks such as `DO $$ ... $$`.

**Why:** An unquoted heredoc expands `$$` to the shell process ID. PostgreSQL then sees invalid text such as `DO 10000`; with `ON_ERROR_STOP` inside an open transaction, the session exits and the transaction rolls back.

**How to apply:** Keep the SQL heredoc quoted, pass hashes and large base64-encoded document bodies with `psql -v`, reference them as quoted psql variables, and verify the target rows after commit.