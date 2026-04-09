import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  
  // Synthetic Data Generator
  app.get("/api/generate-synthetic-data", (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const transactions = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    let balance = 1000;
    const currencies = ["GHS", "NGN", "XOF", "XAF"];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];

    for (let i = 0; i < 150; i++) {
      const date = new Date(startDate);
      date.setHours(date.getHours() + i * 14); // Roughly 1.7 transactions per day

      // Mimic market days (High volume on certain days)
      const isMarketDay = date.getDay() === 1 || date.getDay() === 4; // Mon, Thu
      const volumeMultiplier = isMarketDay ? 3 : 1;

      const type = Math.random() > 0.4 ? "deposit" : "withdrawal";
      const amount = Math.floor(Math.random() * 500 * volumeMultiplier) + 10;

      if (type === "withdrawal" && balance < amount) continue;

      balance += type === "deposit" ? amount : -amount;

      transactions.push({
        uid: userId,
        type,
        amount,
        timestamp: date.toISOString(),
        counterparty: `Vendor_${Math.floor(Math.random() * 50)}`,
        status: "completed"
      });
    }

    res.json({ transactions, initialBalance: balance, currency });
  });

  // Trust Score Engine Logic (Simplified for Prototype)
  app.post("/api/calculate-trust-score", (req, res) => {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "Transactions array is required" });
    }

    // 1. Consistency: Frequency of deposits
    const deposits = transactions.filter(t => t.type === "deposit");
    const consistencyScore = Math.min(100, (deposits.length / 60) * 100);

    // 2. Velocity: How quickly funds move out
    // Lower is better for trust (holding balance)
    let totalTimeHeld = 0;
    // Simplified: ratio of withdrawals to deposits
    const withdrawals = transactions.filter(t => t.type === "withdrawal");
    const velocityRatio = withdrawals.length / deposits.length;
    const velocityScore = Math.max(0, 100 - (velocityRatio * 50));

    // 3. Resilience: Min balance (Simulated from history)
    // For prototype, we'll use a random resilience factor based on transaction count
    const resilienceScore = Math.min(100, (transactions.length / 100) * 100);

    // 4. Gaming Risk: Circular trading detection
    const counterparties = transactions.map(t => t.counterparty);
    const uniqueCounterparties = new Set(counterparties).size;
    const gamingPenalty = uniqueCounterparties < 5 ? 20 : 0;

    const finalScore = Math.max(0, Math.round((consistencyScore * 0.4 + velocityScore * 0.3 + resilienceScore * 0.3) - gamingPenalty));

    let reason = "Your score is based on your consistent deposit history and diverse transaction network.";
    if (gamingPenalty > 0) reason = "Warning: Limited transaction network detected. Diversify your counterparties to improve trust.";
    else if (velocityScore < 50) reason = "Try holding funds in your wallet longer to improve your resilience score.";

    res.json({ score: finalScore, reason });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
