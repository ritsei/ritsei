{
  description = "RITSEI development environment for a Windows repo through WSL2";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
    in {
      devShells = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          inherit (pkgs) lib;
          # Playwright resolves browsers by revision, so the npm pin must match nixpkgs.
          playwrightBrowsers = pkgs.playwright-driver.selectBrowsers {
            withFirefox = false;
            withWebkit = false;
          };
          pinned = name: version:
            lib.assertMsg (packageJson.devDependencies.${name} or packageJson.dependencies.${name} == version)
              "package.json pins ${name}, but nixpkgs provides ${version}; align them after updating flake.lock.";
        in
        assert pinned "playwright" pkgs.playwright-driver.version;
        assert pinned "tigerbeetle-node" pkgs.tigerbeetle.version;
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              deno
              nodejs_24
              pnpm_12
              ast-grep
              git
              go
              zig
              protobuf
              postgresql_19
              tigerbeetle
            ];

            PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsers;
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

            shellHook = ''
              export PGDATA="''${PGDATA:-$HOME/.local/share/ritsei/postgresql}"
              export PGHOST="''${PGHOST:-127.0.0.1}"
              export PGPORT="''${PGPORT:-5433}"
              export PGUSER="''${PGUSER:-postgres}"
              export PGDATABASE="''${PGDATABASE:-ritsei}"
              export DATABASE_URL="''${DATABASE_URL:-postgresql://postgres:postgres@$PGHOST:$PGPORT/$PGDATABASE}"
            '';
          };
        });
    };
}
