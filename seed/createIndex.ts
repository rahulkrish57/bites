import { initializeRedisClient } from "../utils/client.js";
import { indexKey, getKeyName } from "../utils/keys.js";

async function createIndex() {
  const client = await initializeRedisClient();

  try {
    await client.ft.dropIndex(indexKey);
    console.log("Old index dropped");
  } catch {
    console.log("No existing index to delete");
  }

  console.log("Creating index...");

  await client.ft.create(
    indexKey,
    {
      id: {
        type: "TEXT",
      },
      name: {
        type: "TEXT",
      },
      avgStars: {
        type: "NUMERIC",
        SORTABLE: true,
      },
    },
    {
      ON: "HASH",
      PREFIX: [getKeyName("restaurants")], // must be array
    }
  );

  console.log("Index created successfully");

  await client.quit();
}

createIndex().catch(console.error);
