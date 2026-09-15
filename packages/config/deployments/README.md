# Deployment artifacts

One file per chain, written by `contracts/script/Deploy.s.sol` via `vm.writeJson`.
These are the **only** place addresses live (PRD §0.3). Empty `contracts` means
the chain has not been deployed to yet.
