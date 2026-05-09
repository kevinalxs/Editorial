/**
 * KARE Advisory — Agent Éditorial Automatisé
 * ============================================
 * Déclencheur : changement de statut Notion → "En recherche"
 * Sortie      : contenu rédigé écrit dans Notion + statut → "À relire"
 *
 * Stack : Node.js 18+
 * Dépendances : npm install @notionhq/client @anthropic-ai/sdk dotenv
 *
 * Variables d'environnement (.env) :
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   NOTION_TOKEN=secret_...
 *   NOTION_DATABASE_ID=6aeff41a9d6c4f7f94a799b2ab32b869
 *   NOTIFY_EMAIL=kevin@kare-advisory.com  (optionnel)
 */

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import dotenv from "dotenv";
dotenv.config();

// ─── Clients ────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ─── Prompt système KARE (identité permanente de l'agent) ────────────────────

const KARE_SYSTEM_PROMPT = `Tu es un analyste senior d'une banque d'affaires indépendante spécialisée en M&A mid-market.
Tu produis des contenus LinkedIn pour KARE Advisory, cabinet de conseil stratégique et financier positionné sur l'advisory transactionnel, l'investissement et la création de valeur.

Ta posture permanente : investisseur-analyste, pas consultant-généraliste.
Chaque publication doit répondre à : "Qu'est-ce que ça implique concrètement pour quelqu'un qui a du capital à déployer ou une entreprise à vendre ?"

Règles absolues :
- Affirme, ne nuance que si les données l'imposent
- Chaque chiffre cité doit être sourcé (source entre parenthèses)
- Pas de "Il est intéressant de noter que", pas de question rhétorique en ouverture
- Pas de "Je pense que" — affirme ou source
- La conviction KARE doit être actionnable, pas philosophique
- Ton : analytique, tranchant, sans devoir scolaire`;

// ─── Templates de prompts par format ────────────────────────────────────────

function buildUserPrompt(page) {
  const { titre, format, pilier, angleKARE, ancrageMarche } = page;

  const baseContext = `
SUJET : ${titre}
PILIER : ${pilier}
ANGLE KARE : ${angleKARE}
ANCRAGE MARCHÉ : ${ancrageMarche}
`;

  const prompts = {
    "Sector Watch": `${baseContext}

FORMAT : Sector Watch (note sectorielle mensuelle, 900–1100 mots)

ÉTAPE 1 — RECHERCHE WEB
Effectue 4 à 6 recherches web approfondies sur ce sujet. Cible :
- Données de marché récentes (taille, croissance, acteurs)
- Transactions M&A des 12–18 derniers mois avec multiples si disponibles
- Fonds PE/VC actifs, levées, exits notables
- Réglementation ou politique publique impactant la valorisation
- Signaux faibles : consolidations, acteurs en difficulté, nouvelles entrées

ÉTAPE 2 — ANALYSE INVESTISSEUR
Construis la thèse en répondant à :
1. Quel contexte macro crée une opportunité ou un risque aujourd'hui ?
2. Quels profils de cibles sont attractifs (taille, rentabilité, modèle) ?
3. Quels acheteurs sont actifs et pourquoi ?
4. Quel est le niveau de valorisation actuel et sa dynamique ?
5. Quels sont les 2–3 risques principaux de thèse ?

ÉTAPE 3 — RÉDACTION

Structure imposée :

[ACCROCHE]
1 phrase qui pose l'enjeu en termes de capital ou de valeur. Pas de question rhétorique. Affirme.

[CONTEXTE MARCHÉ]
2–3 paragraphes : dynamiques structurelles, chiffres clés sourcés, ce qui a changé récemment.

[CE QUE ÇA IMPLIQUE EN M&A]
2 paragraphes : qui achète, qui vend, pourquoi maintenant, quelle est la fenêtre de marché.

[THÈSE KARE]
• Conviction 1 : [secteur / profil de cible / timing]
• Conviction 2 : [levier de création de valeur identifié]
• Conviction 3 : [risque principal + condition pour que la thèse tienne]

[SIGNAL DE CLÔTURE]
1 phrase qui interpelle un profil précis (LP, CEO, M&A advisor, DG d'ETI).

Hashtags : 4–5 maximum (#mergersandacquisitions #privateequity #[secteur] #dealflow)`,

    "Deal Lens": `${baseContext}

FORMAT : Deal Lens (décryptage transaction, 450–600 mots)

ÉTAPE 1 — RECHERCHE WEB
Trouve et synthétise sur la transaction ou le deal mentionné :
- Faits : acheteur, cible, valeur, date, structure si connue
- Multiple payé ou estimation raisonnée (EV/EBITDA, EV/CA)
- Logique stratégique déclarée et réactions marché
- Transactions comparables pour benchmarker

Si aucune transaction spécifique n'est mentionnée, recherche le deal le plus significatif récent (3 derniers mois) correspondant au sujet.

ÉTAPE 2 — ANALYSE INVESTISSEUR
1. Pourquoi cet acheteur, pourquoi maintenant ?
2. Le prix est-il justifié ? (benchmark, prime, synergies implicites)
3. Qu'est-ce que ça dit du secteur ?
4. Quelles opportunités adjacentes ce deal crée-t-il ?

ÉTAPE 3 — RÉDACTION

Structure imposée :

[TITRE]
"[Acheteur] acquiert [Cible] — ce que ça dit vraiment du marché [secteur]"

[LE DEAL EN 3 LIGNES]
Qui, quoi, combien, pourquoi officiellement.

[L'ANALYSE QUE PERSONNE NE PUBLIE]
2–3 paragraphes : la vraie logique derrière le deal. Tu peux contredire la lecture officielle si les faits le justifient.

[CE QUE ÇA IMPLIQUE]
• Pour les cibles comparables : [impact sur leur valorisation]
• Pour les acheteurs en recherche : [signal à retenir]
• Pour les vendeurs en réflexion : [fenêtre ou risque]

[QUESTION OUVERTE]
1 phrase qui invite au débat professionnel ciblé.

Hashtags : 3–4 (#mergersandacquisitions #[secteur] #dealflow)`,

    "Signal Marché": `${baseContext}

FORMAT : Signal Marché (prise de position courte, 150–220 mots)

ÉTAPE 1 — RECHERCHE WEB
Vérifie et contextualise le signal ou la stat mentionnée :
- La donnée est-elle exacte et sourcée ?
- Benchmark : vs. année précédente, vs. moyenne historique
- Acteurs ou secteurs les plus impactés

ÉTAPE 2 — RÉDACTION

Structure imposée :

[STAT OU FAIT]
1 ligne : le chiffre ou le fait brut, sourcé et précis.

[CE QUE ÇA VEUT DIRE]
2–3 phrases max : l'implication directe pour un investisseur ou un dirigeant.

[LA CONVICTION KARE]
1 phrase affirmative et actionnable : ce que ça change dans une stratégie d'acquisition ou de cession.

[INTERPELLATION]
1 phrase ciblant un profil précis (DG, DAF, investisseur, CEO fondateur, family office).

Hashtags : 3 maximum.`,
  };

  return prompts[format] || prompts["Signal Marché"];
}

// ─── Récupération des pages "En recherche" depuis Notion ────────────────────

async function getPagesEnRecherche() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Statut",
      select: { equals: "En recherche" },
    },
    sorts: [{ property: "Date de publication", direction: "ascending" }],
  });

  return response.results.map((page) => ({
    id: page.id,
    titre: page.properties["Titre"]?.title?.[0]?.plain_text || "",
    format: page.properties["Format"]?.select?.name || "",
    pilier: page.properties["Pilier"]?.select?.name || "",
    angleKARE: page.properties["Angle KARE"]?.rich_text?.[0]?.plain_text || "",
    ancrageMarche:
      page.properties["Ancrage marché"]?.rich_text?.[0]?.plain_text || "",
    datePublication:
      page.properties["Date de publication"]?.date?.start || null,
  }));
}

// ─── Appel Claude avec web search ───────────────────────────────────────────

async function generateContent(page) {
  console.log(`\n📝 Génération : "${page.titre}" [${page.format}]`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: KARE_SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserPrompt(page),
      },
    ],
  });

  // Extraction du texte final (après recherches web)
  const textBlocks = response.content.filter((b) => b.type === "text");
  const fullText = textBlocks.map((b) => b.text).join("\n\n");

  console.log(`  ✓ ${fullText.length} caractères générés`);
  return fullText;
}

// ─── Écriture du contenu dans Notion ────────────────────────────────────────

async function writeToNotion(pageId, content, titre) {
  // Conversion du texte en blocs Notion
  const paragraphs = content.split("\n\n").filter((p) => p.trim().length > 0);

  const blocks = paragraphs.map((para) => {
    // Détection des sections en majuscules [TITRE]
    if (para.match(/^\[.+\]$/)) {
      return {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: para.replace(/[\[\]]/g, "") } }],
        },
      };
    }
    // Détection des bullets •
    if (para.startsWith("•")) {
      return {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: para.replace(/^•\s*/, "") } }],
        },
      };
    }
    // Paragraphe standard (max 2000 chars par bloc Notion)
    const truncated = para.substring(0, 1999);
    return {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: truncated } }],
      },
    };
  });

  // Ajout d'un bloc callout en tête avec métadonnées
  const callout = {
    object: "block",
    type: "callout",
    callout: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Généré automatiquement par l'agent KARE le ${new Date().toLocaleDateString("fr-FR")}. À relire et ajuster avant publication.`,
          },
        },
      ],
      icon: { type: "emoji", emoji: "🤖" },
      color: "yellow_background",
    },
  };

  // Écriture dans Notion (par batches de 100 blocs max)
  const allBlocks = [callout, ...blocks];
  for (let i = 0; i < allBlocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: allBlocks.slice(i, i + 100),
    });
  }

  // Mise à jour du statut → "À relire"
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Statut: { select: { name: "À relire" } },
    },
  });

  console.log(`  ✓ Notion mis à jour → "À relire"`);
}

// ─── Pipeline principal ──────────────────────────────────────────────────────

async function runAgent(options = {}) {
  const { pageId = null, processAll = false } = options;

  console.log("🚀 Agent KARE Editorial démarré");

  let pages;

  if (pageId) {
    // Mode ciblé : une seule page (appelé par webhook Make/n8n)
    const page = await notion.pages.retrieve({ page_id: pageId });
    pages = [
      {
        id: page.id,
        titre: page.properties["Titre"]?.title?.[0]?.plain_text || "",
        format: page.properties["Format"]?.select?.name || "",
        pilier: page.properties["Pilier"]?.select?.name || "",
        angleKARE:
          page.properties["Angle KARE"]?.rich_text?.[0]?.plain_text || "",
        ancrageMarche:
          page.properties["Ancrage marché"]?.rich_text?.[0]?.plain_text || "",
      },
    ];
  } else {
    // Mode batch : toutes les pages "En recherche"
    pages = await getPagesEnRecherche();
  }

  if (pages.length === 0) {
    console.log("ℹ️  Aucune page en statut 'En recherche'. Arrêt.");
    return;
  }

  console.log(`📋 ${pages.length} publication(s) à traiter`);

  const results = [];

  for (const page of pages) {
    if (!page.titre || !page.format) {
      console.warn(`  ⚠️  Page ${page.id} incomplète — ignorée`);
      continue;
    }

    try {
      // 1. Générer le contenu via Claude
      const content = await generateContent(page);

      // 2. Écrire dans Notion + changer le statut
      await writeToNotion(page.id, content, page.titre);

      results.push({ id: page.id, titre: page.titre, status: "success" });

      // Pause entre les appels pour respecter les rate limits
      if (pages.length > 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error(`  ✗ Erreur sur "${page.titre}":`, err.message);
      console.error(`  Détail:`, err.status, err.code, err.error);
      results.push({ id: page.id, titre: page.titre, status: "error", error: err.message });
    }
  }

  console.log("\n✅ Agent terminé");
  console.log(`  Succès : ${results.filter((r) => r.status === "success").length}`);
  console.log(`  Erreurs : ${results.filter((r) => r.status === "error").length}`);

  return results;
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

// Appel direct : node kare_agent.js
// Appel avec page spécifique : node kare_agent.js PAGE_ID
// Intégration Make/n8n : exporter runAgent et l'appeler avec { pageId }

const args = process.argv.slice(2);
if (args.length > 0) {
  runAgent({ pageId: args[0] });
} else {
  runAgent({ processAll: true });
}

export { runAgent };
