import express, { type Request } from "express";
import { nanoid } from "nanoid";
import { validate } from "../middlewares/validate.js";
import { RestaurantSchema, type Restaurant } from "../schemas/restaurant.js";
import { initializeRedisClient } from "../utils/client.js";
import { restaurantKeyById } from "../utils/keys.js";
import { successResponse } from "../utils/responses.js";
import { checkRestaurantExists } from "../middlewares/checkRestaurantId.js";
const router = express.Router();

router.get("/", async (req, res) => {
  res.send("Hello Restaurants");
});
router.post("/", validate(RestaurantSchema), async (req, res, next) => {
  const data = req.body as Restaurant;
  try {
    const client = await initializeRedisClient();
    const id = nanoid();
    const restaurantkey = restaurantKeyById(id);
    const hashData = { id, name: data.name, location: data.location };
    const addResult = await client.hSet(restaurantkey, hashData);
    console.log(`Added ${addResult} fields`);
    return successResponse(res, hashData, "Added New Restaurant");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:restaurantId",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const { restaurantId } = req.params;
      const restaurantkey = restaurantKeyById(restaurantId);
      const [viewCount, restaurant] = await Promise.all([
        client.hIncrBy(restaurantkey, "viewCount", 1),
        client.hGetAll(restaurantkey),
      ]);
      return successResponse(res, restaurant, "Restaurant Details");
    } catch (error) {
      next(error);
    }
  },
);
export default router;
