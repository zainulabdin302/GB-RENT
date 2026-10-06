/**
 * One-off seed image generator. Generates 9 realistic-looking property
 * photos for the GB Rent seed data and overwrites the 1x1 placeholders in
 * public/uploads/. Run with: bun scripts/generate-seed-images.ts
 *
 * Uses the z-ai-web-dev-sdk image generation (backend only).
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public", "uploads");

const jobs: Array<{ file: string; prompt: string }> = [
  {
    file: "seed-shop-1.jpg",
    prompt:
      "Photograph of a small roadside shop front in Gilgit bazaar, northern Pakistan, with a painted signboard, glass display, mountains in the background, daytime, realistic, high quality",
  },
  {
    file: "seed-shop-2.jpg",
    prompt:
      "Photograph of a corner shop in Skardu main bazaar with colorful signage, stacked goods visible through window, Karakoram mountains behind, realistic daylight, high quality",
  },
  {
    file: "seed-house-1.jpg",
    prompt:
      "Photograph of a modern two-story house in Hunza valley with large windows, stone and wood facade, apricot trees in front, snow-capped mountains in background, golden hour, high quality real estate photography",
  },
  {
    file: "seed-house-2.jpg",
    prompt:
      "Photograph of a traditional Gilgit-Baltistan house with wooden balcony, whitewashed walls, terraced garden, Karakoram peaks behind, bright daylight, high quality",
  },
  {
    file: "seed-house-3.jpg",
    prompt:
      "Photograph of a contemporary family house in Skardu with courtyard, parked car, garden, mountain backdrop, blue sky, real estate listing photo, high quality",
  },
  {
    file: "seed-room-1.jpg",
    prompt:
      "Photograph of a furnished single room for rent with bed, study table, rug, warm lighting, window with mountain view, neat interior, real estate listing photo, high quality",
  },
  {
    file: "seed-room-2.jpg",
    prompt:
      "Photograph of a simple student room in Gilgit with twin bed, bookshelf, fan, clean walls, window with valley view, natural daylight, real estate listing photo, high quality",
  },
  {
    file: "seed-hostel-1.jpg",
    prompt:
      "Photograph of a small hostel building exterior in Skardu with multiple windows, painted facade, signboard, mountains behind, daytime, real estate listing photo, high quality",
  },
  {
    file: "seed-hostel-2.jpg",
    prompt:
      "Photograph of a hostel dormitory room with bunk beds, lockers, clean wooden floor, window with mountain view, bright, real estate listing photo, high quality",
  },
];

async function generateOne(zai: any, job: (typeof jobs)[number]) {
  try {
    const res = await zai.images.generations.create({
      prompt: job.prompt,
      size: "1344x768",
    });
    const b64 = res.data[0].base64;
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(OUT_DIR, job.file), buf);
    console.log(`OK  ${job.file} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e: any) {
    console.error(`FAIL ${job.file}: ${e?.message ?? e}`);
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  // Generate in parallel batches of 3 to be gentle on rate limits.
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = jobs.slice(i, i + 3);
    await Promise.all(batch.map((j) => generateOne(zai, j)));
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
