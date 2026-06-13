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

function getSupabaseConfig() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, serviceKey };
}

async function getAdminClient() {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadInviteOnboarding() {
  const modUrl = pathToFileURL(
    path.join(__dirname, "../frontend/src/lib/inviteOnboarding.js"),
  ).href;
  return import(modUrl);
}

async function loadHubSpotSync() {
  const modUrl = pathToFileURL(
    path.join(__dirname, "../frontend/src/lib/hubspotSync.js"),
  ).href;
  return import(modUrl);
}

function sendHubSpotCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

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

app.get("/api/invitations/:inviteId", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const admin = await getAdminClient();
  if (!admin) {
    res.status(503).json({
      error: "Server is not configured for invitation onboarding.",
    });
    return;
  }

  try {
    const { fetchInvitationById } = await loadInviteOnboarding();
    const inviteId = String(req.params.inviteId || "").trim();
    const result = await fetchInvitationById(admin, inviteId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(200).json({ invitation: result.data });
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Internal server error" });
  }
});

app.options("/api/invitations/accept", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(204).end();
});

app.post("/api/invitations/accept", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const admin = await getAdminClient();
  if (!admin) {
    res.status(503).json({
      error: "Server is not configured for invitation onboarding.",
    });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }

  const inviteId = String(req.body?.inviteId || "").trim();
  const fullName = String(req.body?.fullName || "").trim();
  if (!inviteId || !fullName) {
    res.status(400).json({ error: "inviteId and fullName are required." });
    return;
  }

  try {
    const { acceptInvitationForUser } = await loadInviteOnboarding();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("[invite] auth token invalid", userErr);
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }

    const user = userData.user;
    const result = await acceptInvitationForUser(admin, {
      inviteId,
      userId: user.id,
      userEmail: user.email || "",
      fullName,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json(result.data);
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Internal server error" });
  }
});

app.options("/api/integrations/hubspot/contacts", (req, res) => {
  sendHubSpotCors(res);
  res.status(204).end();
});

app.get("/api/integrations/hubspot/contacts", async (req, res) => {
  sendHubSpotCors(res);

  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN || "";
  if (!hubspotToken) {
    res.status(503).json({
      error: "HubSpot integration is not configured (set HUBSPOT_ACCESS_TOKEN).",
    });
    return;
  }

  const admin = await getAdminClient();
  if (!admin) {
    res.status(503).json({
      error: "Server is not configured (set SUPABASE_SERVICE_ROLE_KEY and Supabase URL in frontend/.env).",
    });
    return;
  }

  try {
    const { authenticateHubSpotImport, syncHubSpotContacts } = await loadHubSpotSync();
    const auth = await authenticateHubSpotImport(admin, req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const result = await syncHubSpotContacts(admin, {
      hubspotAccessToken: hubspotToken,
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "HubSpot import failed" });
  }
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
