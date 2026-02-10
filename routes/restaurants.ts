import express from "express";
import { validate } from "../middlewares/validate.js";
import { RestaurantSchema, type Restaurant } from "../schemas/restaurant.js";

const router = express.Router();

router.get("/", async (req, res) => {
    res.send("Hello Restaurants")
})
router.post("/", validate(RestaurantSchema),async (req, res) => {
    const data = req.body as Restaurant
    res.send("Hello Restaurants")
})
export default router;