/**
 * KARE Agent — Handler Webhook Make.com
 * =======================================
 * Ce fichier est utilisé si tu héberges l'agent sur un serveur (Railway, Render, etc.)
 * et que Make.com lui envoie un webhook quand le statut Notion change.
 *
 * Déploiement rapide : Railway.app → New Project → Deploy from GitHub
 * Coût : ~$5/mois ou gratuit avec le tier hobby
 *
 * npm install express
 */

import express from "express";
import { runAgent } from "./kare_agent.js";

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "kare-secret-2026";

/**
 * POST /webhook/notion
 * Appelé par Make.com quand une page Notion passe en "En recherche"
 * Body attendu : { pageId: "notion-page-id", secret: "..." }
 */
app.post("/webhook/notion", async (req, res) => {
  const { pageId, secret } = req.body;

  // Vérification du secret
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!pageId) {
    return res.status(400).json({ error: "pageId requis" });
  }

  // Réponse immédiate (Make.com timeout à 40s)
  res.json({ status: "accepted", pageId, message: "Traitement en cours" });

  // Traitement asynchrone
  try {
    console.log(`\n📨 Webhook reçu pour la page : ${pageId}`);
    await runAgent({ pageId });
  } catch (err) {
    console.error("Erreur agent:", err);
  }
});

/**
 * POST /webhook/batch
 * Traite toutes les pages "En recherche" (appelable par un CRON Make.com)
 */
app.post("/webhook/batch", async (req, res) => {
  const { secret } = req.body;

  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ status: "accepted", message: "Batch en cours" });

  try {
    await runAgent({ processAll: true });
  } catch (err) {
    console.error("Erreur batch:", err);
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", agent: "KARE Editorial", version: "1.0" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 KARE Agent en écoute sur le port ${PORT}`);
});
