import { probePlayerRankingRanges, DEFAULT_SERVER } from "../api/e4k-client.js";
console.log("PL1 ranking diagnostics target:", DEFAULT_SERVER);
await probePlayerRankingRanges({ server: DEFAULT_SERVER });
