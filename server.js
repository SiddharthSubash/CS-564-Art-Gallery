import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const SEARCH_API_URL = "https://data.rijksmuseum.nl/search/collection";

async function translateToEnglish(text) {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|en`,
    );

    const data = await res.json();
    const translated = data?.responseData?.translatedText || "";

    if (
      !translated ||
      translated.includes("MYMEMORY WARNING") ||
      translated.includes("YOU USED ALL AVAILABLE FREE TRANSLATIONS")
    ) {
      return text;
    }

    return translated;
  } catch (err) {
    console.error("Translation failed:", err);
    return text;
  }
}

function getText(value) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = getText(item);
      if (text) return text;
    }
    return "";
  }

  return (
    value.content ||
    value.value ||
    value.label ||
    value._label ||
    value.name ||
    value["@value"] ||
    ""
  );
}

function getTitleFromLinkedArt(obj) {
  const identified = obj?.identified_by || [];
  for (const item of identified) {
    const text = getText(item);
    if (text) return text;
  }
  return "Untitled";
}

function getMakerFromLinkedArt(obj) {
  const producedBy = obj?.produced_by;
  if (!producedBy) return "Unknown";

  const parts = producedBy?.part || [];
  for (const part of parts) {
    const carriedOutBy = part?.carried_out_by || [];
    for (const person of carriedOutBy) {
      const notation = person?.notation || [];
      for (const n of notation) {
        const text = getText(n);
        if (text) return text;
      }
      const fallback = getText(person);
      if (fallback) return fallback;
    }
  }

  const directCarriedOutBy = producedBy?.carried_out_by || [];
  for (const person of directCarriedOutBy) {
    const notation = person?.notation || [];
    for (const n of notation) {
      const text = getText(n);
      if (text) return text;
    }
    const fallback = getText(person);
    if (fallback) return fallback;
  }

  return "Unknown";
}

function getDateFromLinkedArt(obj) {
  const producedBy = obj?.produced_by;
  const timespan = producedBy?.timespan;
  if (!timespan) return "";

  const identified = timespan?.identified_by || [];
  for (const item of identified) {
    const text = getText(item);
    if (text) return text;
  }

  return timespan?.begin_of_the_begin || timespan?.end_of_the_end || "";
}

function getDescriptionFromLinkedArt(obj) {
  const visited = new Set();

  const rejectPatterns = [
    /^hoogte\b/i,
    /^breedte\b/i,
    /^lengte\b/i,
    /^diameter\b/i,
    /^gewicht\b/i,
    /^bruikleen\b/i,
    /^inventarisnummer\b/i,
    /^objectnummer\b/i,
  ];

  let fallback = "";

  function isRejected(text) {
    const t = text.trim();
    return rejectPatterns.some((pattern) => pattern.test(t));
  }

  function extract(node) {
    if (!node) return "";

    if (typeof node === "string") {
      const t = node.trim();
      if (!t || t.startsWith("http") || isRejected(t)) return "";

      // Prefer real longer descriptions
      if (t.length >= 60) return t;

      // Save shorter metadata-style text as fallback
      if (!fallback && t.length >= 20) {
        fallback = t;
      }

      return "";
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const result = extract(item);
        if (result) return result;
      }
      return "";
    }

    if (typeof node === "object") {
      if (visited.has(node)) return "";
      visited.add(node);

      if (typeof node.content === "string") {
        const t = node.content.trim();

        if (!t.startsWith("http") && !isRejected(t)) {
          if (t.length >= 60) return t;
          if (!fallback && t.length >= 20) {
            fallback = t;
          }
        }
      }

      if (node.referred_to_by) {
        const result = extract(node.referred_to_by);
        if (result) return result;
      }

      if (node.subject_of) {
        const result = extract(node.subject_of);
        if (result) return result;
      }

      if (node.part) {
        const result = extract(node.part);
        if (result) return result;
      }

      for (const value of Object.values(node)) {
        const result = extract(value);
        if (result) return result;
      }
    }

    return "";
  }

  const longDescription = extract(obj);
  return (
    longDescription || fallback || "No description available for this artwork."
  );
}

function extractCollectionPageUrlFromSubjectOf(obj) {
  const subjectOf = obj?.subject_of || [];

  for (const entry of subjectOf) {
    const digitallyCarriedBy = entry?.digitally_carried_by || [];

    for (const digitalObject of digitallyCarriedBy) {
      const accessPoints = digitalObject?.access_point || [];

      for (const ap of accessPoints) {
        const url = ap?.id || "";
        if (
          typeof url === "string" &&
          url.includes("www.rijksmuseum.nl") &&
          url.includes("/collectie/object/")
        ) {
          return url;
        }
      }
    }
  }

  return "";
}

function extractOldObjectNumberFromPageUrl(pageUrl = "") {
  const match = pageUrl.match(/\/object\/([^/]+?)--/);
  return match?.[1] || "";
}

function buildIiifImageUrl(raw) {
  if (!raw || typeof raw !== "string") return "";

  if (raw.endsWith("/info.json")) {
    return raw.replace("/info.json", "/full/800,/0/default.jpg");
  }

  if (raw.includes("/full/")) {
    return raw;
  }

  if (raw.includes("iiif.micr.io")) {
    return `${raw.replace(/\/$/, "")}/full/800,/0/default.jpg`;
  }

  return "";
}

function extractIiifUrlFromHtml(html = "") {
  // direct info.json
  let match = html.match(/https:\/\/iiif\.micr\.io\/[A-Za-z0-9]+\/info\.json/g);
  if (match?.[0]) return buildIiifImageUrl(match[0]);

  // direct /full/... image
  match = html.match(/https:\/\/iiif\.micr\.io\/[A-Za-z0-9]+\/full\/[^"' ]+/g);
  if (match?.[0]) return match[0];

  // bare iiif base
  match = html.match(/https:\/\/iiif\.micr\.io\/[A-Za-z0-9]+/g);
  if (match?.[0]) return buildIiifImageUrl(match[0]);

  return "";
}

async function fetchSearchPage(params = {}) {
  const url = new URL(SEARCH_API_URL);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Search API failed: ${res.status}`);
  }

  return await res.json();
}

async function resolveObjectByIdUrl(idUrl) {
  const res = await fetch(idUrl, {
    headers: {
      Accept: "application/ld+json",
    },
  });

  if (!res.ok) {
    throw new Error(`Resolver failed: ${res.status}`);
  }

  return await res.json();
}

async function normalizeResolvedObject(linkedArtObj) {
  const id = linkedArtObj?.id || "";
  const collectionPageUrl = extractCollectionPageUrlFromSubjectOf(linkedArtObj);
  const objectNumber = extractOldObjectNumberFromPageUrl(collectionPageUrl);

  let description = getDescriptionFromLinkedArt(linkedArtObj) || "";

  // Translate only if description exists
  if (description) {
    description = await translateToEnglish(description);
  }

  return {
    id,
    objectNumber,
    collectionPageUrl,
    title: getTitleFromLinkedArt(linkedArtObj) || "Untitled",
    principalOrFirstMaker: getMakerFromLinkedArt(linkedArtObj) || "Unknown",
    principalMaker: getMakerFromLinkedArt(linkedArtObj) || "Unknown",
    webImage: {
      url: collectionPageUrl
        ? `http://localhost:5000/api/image-by-page?url=${encodeURIComponent(
            collectionPageUrl,
          )}`
        : "",
    },
    description,
    dating: {
      presentingDate: getDateFromLinkedArt(linkedArtObj) || "",
    },
    raw: linkedArtObj,
  };
}

async function resolveSearchResults(orderedItems = [], limit = 20) {
  const sliced = orderedItems.slice(0, limit);
  const results = [];

  for (const item of sliced) {
    const idUrl = item?.id;
    if (!idUrl) continue;

    try {
      const linkedArtObj = await resolveObjectByIdUrl(idUrl);
      const normalized = await normalizeResolvedObject(linkedArtObj);
      results.push(normalized);
    } catch (err) {
      console.error("Error enriching item:", idUrl, err.message);
    }
  }

  return results;
}

// Proxy image by scraping the Rijksmuseum collection page for an IIIF image URL
app.get("/api/image-by-page", async (req, res) => {
  try {
    const pageUrl = req.query.url;

    if (!pageUrl || typeof pageUrl !== "string") {
      return res.status(400).send("Missing page URL");
    }

    console.log("Fetching collection page:", pageUrl);

    const pageResponse = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!pageResponse.ok) {
      console.log("Collection page status:", pageResponse.status);
      return res.status(pageResponse.status).send("Collection page not found");
    }

    const html = await pageResponse.text();
    const iiifUrl = extractIiifUrlFromHtml(html);

    console.log("Extracted IIIF URL:", iiifUrl || "<none>");

    if (!iiifUrl) {
      return res.status(404).send("Image not found");
    }

    const imageResponse = await fetch(iiifUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    console.log("IIIF image status:", imageResponse.status);

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).send("Image not found");
    }

    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.send(buffer);
  } catch (error) {
    console.error("Error proxying image-by-page:", error);
    res.status(500).send("Failed to load image");
  }
});

app.get("/api/collections", async (_req, res) => {
  try {
    const searchData = await fetchSearchPage({
      type: "painting",
      imageAvailable: "true",
    });

    const artworks = await resolveSearchResults(
      searchData?.orderedItems || [],
      30,
    );
    res.json(artworks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

app.get("/api/artworks-by-maker", async (req, res) => {
  try {
    const maker = req.query.maker || "";

    const searchData = await fetchSearchPage({
      creator: maker,
      imageAvailable: "true",
      type: "painting",
    });

    const artworks = await resolveSearchResults(
      searchData?.orderedItems || [],
      50,
    );
    res.json(artworks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch artworks by maker" });
  }
});

app.get("/api/piece/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const searchData = await fetchSearchPage({
      objectNumber: id,
    });

    const firstItem = searchData?.orderedItems?.[0];
    if (!firstItem?.id) {
      return res.status(404).json({ error: "Artwork not found" });
    }

    const linkedArtObj = await resolveObjectByIdUrl(firstItem.id);

    console.log("PIECE RAW OBJECT:");
    console.log(JSON.stringify(linkedArtObj, null, 2));
    console.log(
      "EXTRACTED DESCRIPTION:",
      getDescriptionFromLinkedArt(linkedArtObj),
    );

    const normalized = await normalizeResolvedObject(linkedArtObj);
    res.json(normalized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch artwork" });
  }
});

app.get("/api/artwork-counts", async (req, res) => {
  try {
    const { material, century } = req.query;

    const response = await fetchSearchPage({
      material,
      creationDate: `${century}??`,
    });

    res.json({ count: response?.partOf?.totalItems || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ count: 0 });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
