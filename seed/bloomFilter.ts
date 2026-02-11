import { initializeRedisClient } from "../utils/client.js";
import { bloomKey } from "../utils/keys.js";

export async function createBoomFilter() {
  const client = await initializeRedisClient();
  await Promise.all([
    client.del(bloomKey),
    client.bf.reserve(bloomKey, 0.001, 1000000),
  ]);
}
await createBoomFilter();
process.exit();
