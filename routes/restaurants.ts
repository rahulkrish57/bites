import express, { type Request } from "express";
import { nanoid } from "nanoid";
import { validate } from "../middlewares/validate.js";
import {
  RestaurantDetailsSchema,
  RestaurantSchema,
  type Restaurant,
  type RestaurantDetails,
} from "../schemas/restaurant.js";
import { ReviewSchema, type Review } from "../schemas/review.js";
import { initializeRedisClient } from "../utils/client.js";
import {
  bloomKey,
  cuisineKey,
  cuisinesKey,
  indexKey,
  restaurantCuisinesKeyById,
  restaurantDetailsKeyById,
  restaurantKeyById,
  restaurantsByRatingkey,
  reviewDetailsKeyById,
  reviewkeyById,
  WeatherKeyById,
} from "../utils/keys.js";
import { errorResponse, successResponse } from "../utils/responses.js";
import { checkRestaurantExists } from "../middlewares/checkRestaurantId.js";
const router = express.Router();
router.get("/", async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const start = (Number(page) - 1) * Number(limit);
  const end = start + Number(limit);
  try {
    const client = await initializeRedisClient();
    const restaurantIds = await client.zRange(
      restaurantsByRatingkey,
      start,
      end,
      {
        REV: true,
      },
    );
    const restaurants = await Promise.all(
      restaurantIds.map((id) => client.hGetAll(restaurantKeyById(id))),
    );
    return successResponse(res, restaurants);
  } catch (error) {
    next(error);
  }
});
router.post("/", validate(RestaurantSchema), async (req, res, next) => {
  const data = req.body as Restaurant;
  try {
    const client = await initializeRedisClient();
    const id = nanoid();
    const restaurantkey = restaurantKeyById(id);
    const bloomString = `${data.name}:${data.location}`;
    const seenBefore = await client.bf.exists(bloomKey, bloomString);
    if (seenBefore) {
      return errorResponse(res, 409, "Restaurant Already Exists");
    }
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
      client.zAdd(restaurantsByRatingkey, {
        score: 0,
        value: id,
      }),
      client.bf.add(bloomKey, bloomString),
    ]);
    return successResponse(res, hashData, "Added New Restaurant");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:restaurantId/weather",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const weatherkey = WeatherKeyById(restaurantId);
      const cachedWeather = await client.get(weatherkey);
      if (cachedWeather) {
        return successResponse(res, JSON.parse(cachedWeather));
      }
      const restaurantkey = restaurantKeyById(restaurantId);
      const coords = await client.hGet(restaurantkey, "location");
      if (!coords) {
        return errorResponse(res, 404, "Coorinates have not been found");
      }
      const [lon, lat] = coords.split(",");
      const apiResponse = await fetch(
        `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${coords}?key=${process.env.WEATHER_API_KEY}`,
      );
      if (apiResponse.status === 200) {
        const json = await apiResponse.json();
        await client.set(weatherkey, JSON.stringify(json), {
          EX: 60 * 60,
        });
        return successResponse(res, json);
      }
      console.log("error", apiResponse);
      return errorResponse(res, 500, "Couldnt fetch weather info");
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:restaurantId/details",
  checkRestaurantExists,
  validate(RestaurantDetailsSchema),
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const data = req.body as RestaurantDetails;
    try {
      const client = await initializeRedisClient();
      const restaurantDetailskey = restaurantDetailsKeyById(restaurantId);
      await client.json.set(restaurantDetailskey, ".", data);
      return successResponse(res, {}, "restaurant details added");
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:restaurantId/details",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const restaurantDetailskey = restaurantDetailsKeyById(restaurantId);
      const data = await client.json.get(restaurantDetailskey);
      return successResponse(res, data);
    } catch (error) {
      next(error);
    }
  },
);

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
      const reviewKey = reviewkeyById(restaurantId);
      const reviewDetailsKey = reviewDetailsKeyById(reviewId);
      const restaurantkey = restaurantKeyById(restaurantId);
      const reviewData = {
        id: reviewId,
        ...data,
        timestamp: Date.now(),
        restaurantId,
      };
      const [reviewCount, setResult, totalStars] = await Promise.all([
        client.lPush(reviewKey, reviewId),
        client.hSet(reviewDetailsKey, reviewData),
        client.hIncrByFloat(
          restaurantKeyById(restaurantId),
          "totalStars",
          data.rating,
        ),
      ]);
      const averageRating = Number(
        (Number(totalStars) / reviewCount).toFixed(1),
      );

      await Promise.all([
        client.zAdd(restaurantsByRatingkey, {
          score: averageRating,
          value: restaurantId,
        }),
        client.hSet(restaurantkey, "avgStars", averageRating),
      ]);
      return successResponse(res, reviewData, "Review Added");
    } catch (error) {
      next(error);
    }
  },
);

router.get("/search", async (req, res, next) => {
  const { q } = req.query;
  try {
    const client = await initializeRedisClient();
    const results = await client.ft.search(indexKey, `@name:${q}`);
    return successResponse(res, results);
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
