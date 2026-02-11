import express, { type Request } from "express";
import { nanoid } from "nanoid";
import { validate } from "../middlewares/validate.js";
import { RestaurantSchema, type Restaurant } from "../schemas/restaurant.js";
import { ReviewSchema, type Review } from "../schemas/review.js";
import { initializeRedisClient } from "../utils/client.js";
import {
  cuisineKey,
  cuisinesKey,
  restaurantCuisinesKeyById,
  restaurantKeyById,
  reviewDetailsKeyById,
  reviewkeyById,
} from "../utils/keys.js";
import { errorResponse, successResponse } from "../utils/responses.js";
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
    await Promise.all([
      ...data.cuisines.map((cuisine) =>
        Promise.all([
          client.sAdd(cuisinesKey, cuisine),
          client.sAdd(cuisineKey(cuisine), id),
          client.sAdd(restaurantCuisinesKeyById(id), cuisine),
        ]),
      ),
      client.hSet(restaurantkey, hashData),
    ]);
    return successResponse(res, hashData, "Added New Restaurant");
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:restaurantId/reviews",
  checkRestaurantExists,
  validate(ReviewSchema),
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;

    const data = req.body as Review;
    try {
      const client = await initializeRedisClient();
      const reviewId = nanoid();
      const reviewkey = reviewkeyById(restaurantId);
      const reiewDetailsKey = reviewDetailsKeyById(reviewId);
      const reviewData = {
        id: reviewId,
        ...data,
        timestamp: Date.now(),
        restaurantId,
      };
      await Promise.all([
        client.lPush(reviewkey, reviewId),
        client.hSet(reiewDetailsKey, reviewData),
      ]);
      return successResponse(res, reviewData, "Review Added");
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:restaurantId",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const { restaurantId } = req.params;
      const restaurantkey = restaurantKeyById(restaurantId);
      const [viewCount, restaurant, cuisines] = await Promise.all([
        client.hIncrBy(restaurantkey, "viewCount", 1),
        client.hGetAll(restaurantkey),
        client.sMembers(restaurantCuisinesKeyById(restaurantId)),
      ]);
      return successResponse(
        res,
        { ...restaurant, cuisines },
        "Restaurant Details",
      );
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/:restaurantId/reviews",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1;
    try {
      const client = await initializeRedisClient();
      const reviewKey = reviewkeyById(restaurantId);
      const reviewIds = await client.lRange(reviewKey, start, end);
      const reviews = await Promise.all(
        reviewIds.map((id) => client.hGetAll(reviewDetailsKeyById(id))),
      );
      return successResponse(res, reviews);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:restaurantId/reviews/:reviewId",
  checkRestaurantExists,
  async (
    req: Request<{ restaurantId: string; reviewId: string }>,
    res,
    next,
  ) => {
    const { restaurantId, reviewId } = req.params;
    try {
      const client = await initializeRedisClient();
      const reviewkey = reviewkeyById(restaurantId);
      const reviewDetailsKey = reviewDetailsKeyById(reviewId);
      const [removeResult, deleteResult] = await Promise.all([
        client.lRem(reviewkey, 0, reviewId),
        client.del(reviewDetailsKey),
      ]);
      if (removeResult === 0 && deleteResult === 0) {
        return errorResponse(res, 404, "Review not found");
      }
      return successResponse(res, reviewId, "Review deleted");
    } catch (error) {
      next(error);
    }
  },
);
export default router;
