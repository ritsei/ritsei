{
  description = "RITSEI development environment for a Windows repo through WSL2";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forEachSystem (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              deno
              nodejs_24
              git
              go
              zig
              protobuf
              postgresql_19
              tigerbeetle
            ];

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
