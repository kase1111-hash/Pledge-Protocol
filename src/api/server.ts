import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import campaignRoutes from "./routes/campaigns";
import pledgeRoutes from "./routes/pledges";
import oracleRoutes from "./routes/oracles";
import backerRoutes from "./routes/backers";

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/v1/campaigns", campaignRoutes);
app.use("/v1/pledges", pledgeRoutes);
app.use("/v1/oracles", oracleRoutes);
app.use("/v1/backers", backerRoutes);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: err.message,
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
    },
  });
});

app.listen(PORT, () => {
  console.log(`Pledge Protocol API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
