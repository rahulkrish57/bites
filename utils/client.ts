import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function initializeRedisClient() {
  if (!client) {
    client = createClient();

    client.on("error", (error) => {
      console.error("Redis error:", error);
    });

    await client.connect();
    console.log("Redis connected");
  }

  return client;
}
