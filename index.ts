import express from "express";
// router
import cuisinesRouter from "./routes/cuisines.js"
import restaurantRouter from "./routes/restaurants.js"
//Middlewares
import { errorHandler } from "./middlewares/errorHandler.js";


const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());
app.use("/cuisines", cuisinesRouter)
app.use("/restaurants", restaurantRouter)

app.use(errorHandler)
app
  .listen(PORT, () => {
    console.log("Application is running on port", PORT);
  })
  .on("error", (error) => {
    throw new Error(error.message);
  });

