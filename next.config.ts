import type { NextConfig } from "next";
import path from "node:path";

const development = process.env.NODE_ENV === "development";
const aliases = {
  "@/src/components/local-research-features": development
    ? "./src/components/local-research-features.tsx"
    : "./src/components/local-research-disabled.tsx",
  "@/src/components/ObservationExplorer": development
    ? "./src/components/ObservationExplorer.tsx"
    : "./src/components/observation-explorer.disabled.tsx",
  "@/src/components/SectorBoundaryEditor": development
    ? "./src/components/SectorBoundaryEditor.tsx"
    : "./src/components/sector-editor.disabled.tsx",
  "@/src/components/SourceLedgerWorkbench": development
    ? "./src/components/SourceLedgerWorkbench.tsx"
    : "./src/components/source-ledger-workbench.disabled.tsx",
  "@/src/components/map/HfwgsjSectorLayer": development
    ? "./src/components/map/HfwgsjSectorLayer.tsx"
    : "./src/components/map/private-sector-layer.disabled.tsx",
};

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    resolveAlias: aliases,
  },
  webpack(config) {
    for (const [specifier, target] of Object.entries(aliases)) {
      config.resolve.alias[specifier] = path.resolve(process.cwd(), target);
    }
    return config;
  },
};

export default nextConfig;
