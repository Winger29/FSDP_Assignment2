import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import morgan from "morgan";
import { researchRoutes } from "./routes/researchRoutes";
import { agentRoutes } from "./routes/agentRoutes";
import { conversationRoutes } from "./routes/conversationRoutes";
import { authRoutes } from "./routes/authRoutes.js";
import { analyticsRoutes } from "./routes/analyticsRoutes";
import { teamRoutes } from "./routes/teamRoutes";
import { uploadRoutes } from "./routes/uploadRoutes";

import { errorHandler } from "./middleware/errorHandler";
import { connectDatabase } from "./config/database";
import { logger } from "./utils/logger";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// 🔐 SECURITY + CORE MIDDLEWARE
// ======================================================

app.use(
  helmet({
    crossOriginResourcePolicy: false, // Fixes AI streaming + images
  })
);

// CORS

console.log("FRONTEND_URL:", process.env.FRONTEND_URL);
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5173",

    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Disable compression for SSE routes (chat streaming)
app.use((req, res, next) => {
  if (req.path.includes("/chat")) return next();
  compression()(req, res, next);
});

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  // Redact sensitive data from logs
  const bodyLog = { ...req.body };
  if (bodyLog.password) bodyLog.password = "[REDACTED]";
  if (bodyLog.token) bodyLog.token = "[REDACTED]";

  logger.info(`HTTP ${req.method} ${req.url}`, {
    body: bodyLog,
    query: req.query,
    params: req.params,
  });
  next();
});

// ======================================================
// 🚦 RATE LIMITING (Does NOT apply to SSE)
// ======================================================
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.includes("/chat"), // Allow streaming
    message: {
      success: false,
      error: "Too many requests, try again later.",
    },
  })
);

// ======================================================
// 📜 REQUEST LOGGING
// ======================================================

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev", { stream: logger.stream }));
}

// ======================================================
// 🏥 HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "AI Research Agent API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      agents: "/api/agents",
      conversations: "/api/conversations",
      analytics: "/api/analytics",
      teams: "/api/teams",
      uploads: "/api/uploads",
    },
  });
});

// ======================================================
// 📌 MAIN API ROUTES
// ======================================================

app.use("/api/auth", authRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/research", researchRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/uploads", uploadRoutes);

// ======================================================
// ❌ 404 HANDLER
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
  });
});

// ======================================================
// 🛑 GLOBAL ERROR HANDLER
// ======================================================

app.use(errorHandler);

// ======================================================
// 🚀 SERVER STARTUP
// ======================================================

async function startServer() {
  try {
    await connectDatabase();

    const server = app.listen(PORT, () => {
      logger.info(`------------------------------------------------`);
      logger.info(`🚀 AI Research Agent Backend Running`);
      logger.info(`🔗 http://localhost:${PORT}`);
      logger.info(`🌱 Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(`📚 Database: Connected`);
      logger.info(`------------------------------------------------`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info("HTTP server closed.");

        try {
          const { disconnectDatabase } = await import("./config/database.js");
          await disconnectDatabase();
          logger.info("Database connection closed.");
        } catch (err) {
          logger.error("Error closing database:", err);
        }

        process.exit(0);
      });

      setTimeout(() => {
        logger.error("Force shutdown after timeout");
        process.exit(1);
      }, 10_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export default app;
