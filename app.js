import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import v1_api from "./router/main.js";
import LookerRoute from "./router/looker.route.js";

const app = express();

app.set("trust proxy", true);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://www.degreefyd.com",
  "https://degreefyd.com",
  "http://localhost:5174",
  "http://localhost:5175",
  "https://regularlms.degreefyd.com",
  "https://online.degreefyd.com",
  "https://revamp.degreefyd.com",
  "https://testing-lms.degreefyd.com",
  "https://lms.degreefyd.com",
  "https://partner.degreefyd.com",
  "https://testing-referral.degreefyd.com",
  "https://admissions.degreefyd.com",
  "https://online-distance.com",
  "https://info.online-distance.com",
  "https://nmimsonlineuniversity.in",
  "https://findonlineuniversity.com",
  "https://lms-api-test.degreefyd.com",
  "https://apply.degreefyd.com/lp/engineering-colleges-in-punjab",
  "https://apply.degreefyd.com/lp/colleges-in-punjab",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".degreefyd.com") ||
        origin.endsWith(".findonlineuniversity.com")
      ) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (req, res) => {
  res.status(200).send("🚀 LMS API is running");
});

app.use("/v1", v1_api);
app.use("/api", LookerRoute);

app.use((err, req, res, next) => {
  console.error("❌ API ERROR:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

export default app;
