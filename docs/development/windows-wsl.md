# Windows repository with WSL2/Nix development

> **Related documents**
>
> - Repository setup: [`../../README.md`](../../README.md)
> - Deployment profile: [`../../deploy/entry/README.md`](../../deploy/entry/README.md)
> - Documentation ownership: [`../documentation-boundaries.md`](../documentation-boundaries.md)

This is the supported local layout for keeping the Git worktree on Windows while
running the RITSEI toolchain inside NixOS on WSL2:

```text
Windows: C:\Users\ricky\Documents\ritsei
WSL:     /mnt/c/Users/ricky/Documents/ritsei
```

The two paths are the same directory. Keep PostgreSQL data and caches under the
WSL home directory, not inside `/mnt/c`; Linux-heavy I/O across the Windows mount
can be slower.

## 1. Clone on Windows

Run this once in PowerShell:

```powershell
Set-Location C:\Users\ricky\Documents
git clone https://github.com/ritsei/ritsei.git
Set-Location .\ritsei
```

Open `C:\Users\ricky\Documents\ritsei` in the Windows editor or local coding
client. Do not create a second clone in WSL.

## 2. Enter the Nix shell

```powershell
wsl -d NixOS --cd /mnt/c/Users/ricky/Documents/ritsei nix develop
```

Or from a WSL terminal:

```sh
cd /mnt/c/Users/ricky/Documents/ritsei
nix develop
```

`flake.nix` supplies Deno, Node.js, Git, Go, Zig, `protoc`, and PostgreSQL 19.
The shell exports the local development connection as:

```text
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/ritsei
PGDATA=$HOME/.local/share/ritsei/postgresql
```

The flake is Linux-only because WSL2 is the execution boundary; the source
worktree remains on Windows.

## 3. Initialize PostgreSQL 19 in WSL

Run inside `nix develop` once:

```sh
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$(dirname "$PGDATA")"
  initdb --pgdata="$PGDATA" --username="$PGUSER" --auth=trust
fi

pg_ctl --pgdata="$PGDATA" -o "-p $PGPORT -k $PGDATA" -l "$PGDATA/server.log" start
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$PGDATABASE" 2>/dev/null || true
```

Then install the repository dependencies and apply migrations:

```sh
deno install
cp .env.example .env
deno task db:migrate
```

Stop the local database when finished:

```sh
pg_ctl --pgdata="$PGDATA" stop
```

## 4. Run commands from Windows

PowerShell can invoke the same WSL shell without changing the repository path:

```powershell
wsl -d NixOS --cd /mnt/c/Users/ricky/Documents/ritsei nix develop --command deno task check
wsl -d NixOS --cd /mnt/c/Users/ricky/Documents/ritsei nix develop --command deno task test
```

## PostgreSQL through Compose instead

The existing entry Compose profile also provides PostgreSQL 19. It stores data
in a Docker-managed volume rather than the Windows worktree:

```sh
docker compose -f deploy/entry/compose.yaml up -d postgres
```

Use either the native PostgreSQL server or Compose, not both on port `5433`.
