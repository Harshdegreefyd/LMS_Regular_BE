// import Redis from "ioredis";

// const redis = new Redis({
//   host: "127.0.0.1",   
//   port: 6379,
//   maxRetriesPerRequest: null,
//   connectTimeout: 5000,
// });

// redis.on("connect", () => {
//   console.log("✅ Redis connected");
// });

// redis.on("error", (err) => {
//   console.error("❌ Redis error:", err.message);
// });

// export default redis;
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();
const redis = new Redis(process.env.REDIS_URL, {
    tls: {},
    maxRetriesPerRequest: null,
});

redis.on("connect", () => {
    console.log("Redis connected successfully!");
});

redis.on("error", (err) => {
    console.error("Redis connection error:", err);
});

export default redis;
