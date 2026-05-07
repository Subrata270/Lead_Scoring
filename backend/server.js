const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const cors = require("cors");
require("dotenv").config({
  path: path.join(__dirname, "../frontend/.env"),
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "48kb" }));

app.get("/", (req, res) => {
  res.send("API is running… POST /api/public-lead to create a lead.");
});

function sendPublicLeadCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

app.options("/api/public-lead", (req, res) => {
  sendPublicLeadCors(res);
  res.status(204).end();
});

app.post("/api/public-lead", async (req, res) => {
  sendPublicLeadCors(res);

  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceKey) {
    res.status(503).json({
      error:
        "Server is not configured (set SUPABASE_SERVICE_ROLE_KEY and Supabase URL in frontend/.env).",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
  }

  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Expected a JSON object" });
    return;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const modUrl = pathToFileURL(
      path.join(__dirname, "../frontend/src/lib/createPublicLead.js"),
    ).href;
    const { createPublicLead } = await import(modUrl);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await createPublicLead(admin, body, { defaultSource: "api" });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        ...(result.details ? { details: result.details } : {}),
      });
      return;
    }

    res.status(201).json(result.data);
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Internal server error" });
  }
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
