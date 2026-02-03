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
import { shareRoutes } from "./routes/shareRoutes";
import{ groupRoutes } from './routes/groupRoute';
import { groupAgentRoute } from './routes/groupAgentRoute';



import { errorHandler } from "./middleware/errorHandler";
import { connectDatabase } from "./config/database";
import { initializeDatabase } from "./config/initDatabase";
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
app.use(
  cors({
    origin: ["https://snecked-uncollectively-bridgett.ngrok-free.dev","localhost:5173","https://fsdp-assignment2-9hwi.vercel.app"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH","OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());
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
  app.use(morgan("dev"));
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
      share: "/api",
    },
  });
});

// ======================================================
// 📌 MAIN API ROUTES
// ======================================================

// Debug endpoint - no auth required
app.get("/api/debug/health", (req, res) => {
  logger.info("🏥 Health check request");
  res.json({ 
    success: true, 
    message: "Backend is running",
    time: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.SUPABASE_URL ? "✅ Configured" : "❌ Missing",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Configured" : "❌ Missing",
  });
});

// Debug endpoint - test auth
app.get("/api/debug/test-token", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  logger.info("🔍 Test token endpoint called");
  logger.info("Token:", token ? token.substring(0, 30) + "..." : "NO TOKEN");
  
  if (!token) {
    return res.json({ success: false, error: "No token provided" });
  }

  // Try to verify with JWT
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({
      tokenProvided: token.substring(0, 30) + "...",
      decoded,
      success: true,
    });
  } catch (err: any) {
    res.json({
      tokenProvided: token.substring(0, 30) + "...",
      error: err.message,
      success: false,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/research", researchRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api", shareRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/group", groupRoutes);
app.use("/api/group-agent", groupAgentRoute);

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
    await initializeDatabase();

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