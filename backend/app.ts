// src/app.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Mount Aero proxy at root or under /api — choose based on your frontend expectations
// Your frontend calls /suggest_models etc so we mount at root:

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server running on: http://localhost:${port}`);
});
