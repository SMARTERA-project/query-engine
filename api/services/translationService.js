const axios = require("axios");
const IORedis = require("ioredis");
const common = require("../../utils/common")
const config = common.checkConfig(require('../../config'), require('../../config.template'))

const TRANSLATOR_URL = config.TRANSLATOR_URL || "http://127.0.0.1:5000";
const REDIS_URL = config.REDIS_URL || null;
const CACHE_TTL = parseInt(config.CACHE_TTL_SECONDS || "86400", 10);

let redis = null;
if (REDIS_URL) {
  redis = new IORedis(REDIS_URL);
  redis.on("error", (e) => console.warn("Redis error:", e.message));
} else {
  // fallback in-memory cache
  var inMemoryCache = new Map();
}

/**
 * Normalize language code for LibreTranslate (it, en, fr, de, el, lt, pt, es, ...)
 */
function normLang(lang) {
  if (!lang) return "en";
  return lang.toLowerCase();
}

async function getCached(key) {
  if (redis) {
    try {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.warn("Redis get error:", err.message);
      return null;
    }
  } else {
    return inMemoryCache.has(key) ? inMemoryCache.get(key) : null;
  }
}

async function setCached(key, value) {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", CACHE_TTL);
    } catch (err) {
      console.warn("Redis set error:", err.message);
    }
  } else {
    inMemoryCache.set(key, value);
    setTimeout(() => inMemoryCache.delete(key), CACHE_TTL * 1000);
  }
}

/**
 * Translate a single text using LibreTranslate
 * returns translated text or original on failure
 */
async function translateText(text, targetLang) {
  if (!text || typeof text !== "string") return text;
  const lang = normLang(targetLang);
  const cacheKey = `lt:${lang}:${text}`;

  const cached = await getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.post(
      `${TRANSLATOR_URL}/translate`,
      {
        q: text,
        source: "auto",
        target: lang,
        format: "text"
      },
      { timeout: 30000 }
    );
    const translated = res.data && (res.data.translatedText || res.data[0]?.translatedText) ? (res.data.translatedText || res.data[0].translatedText) : null;

    const out = translated || (res.data && typeof res.data === "string" ? res.data : text);

    await setCached(cacheKey, out);
    return out;
  } catch (err) {
    console.warn("Translate error (fallback to original):", err.message);
    return text;
  }
}

/**
 * Translate only the selected fields of a datapoint object. Others fields remain intact.
 */
async function translateDataPoint(dp, targetLang) {
  if (!targetLang || targetLang.toLowerCase() === "en") return dp;

  // Fields we want to translate (add more if needed)
  const fieldsToTranslate = [
    "surveyName",
    "surveyData",
    "updateFrequency"
  ];

  const out = { ...dp };

  for (const f of fieldsToTranslate) {
    if (out[f]) {
      out[f] = await translateText(out[f], targetLang);
    }
  }

  if (out.meta && typeof out.meta === "object" && out.meta.quality) {
    out.meta = { ...out.meta, quality: await translateText(out.meta.quality, targetLang) };
  }

  return out;
}

/**
 * Translate array of datapoints with parallelization but respecting API latencies.
 */
async function translateDataPointsBatch(dataPoints, targetLang) {
  if (!targetLang || targetLang.toLowerCase() === "en") return dataPoints;

  const unique = new Map();
  const fieldsToCheck = ["surveyName", "surveyData", "updateFrequency"];

  for (const dp of dataPoints) {
    for (const f of fieldsToCheck) {
      if (dp[f] && typeof dp[f] === "string") unique.set(dp[f], null);
    }
    if (dp.meta && dp.meta.quality && typeof dp.meta.quality === "string") unique.set(dp.meta.quality, null);
  }

  const entries = Array.from(unique.keys());
  const translations = await Promise.all(entries.map(txt => translateText(txt, targetLang)));

  entries.forEach((orig, i) => unique.set(orig, translations[i]));

  // apply translations
  const out = dataPoints.map(dp => {
    const copy = { ...dp };
    for (const f of fieldsToCheck) {
      if (copy[f] && unique.has(copy[f])) copy[f] = unique.get(copy[f]);
    }
    if (copy.meta && copy.meta.quality && unique.has(copy.meta.quality)) {
      copy.meta = { ...copy.meta, quality: unique.get(copy.meta.quality) };
    }
    return copy;
  });

  return out;
}

module.exports = {
  translateText,
  translateDataPoint,
  translateDataPointsBatch
};
