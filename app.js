const express = require("express");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

const jobs = {};
const storeMaster = {
  S00339218: { store_name: "Retail Hub A", area_code: "1001" },
  S01408764: { store_name: "Retail Hub B", area_code: "2002" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processImage(url) {
  try {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) {
      throw new Error(`Failed to download image. Status: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid image dimensions");
    }

    const perimeter = 2 * (metadata.width + metadata.height);

    await sleep(Math.floor(Math.random() * (400 - 100 + 1)) + 100);
    return perimeter;
  } catch (err) {
    throw new Error(`Image processing error: ${err.message}`);
  }
}

async function processJob(jobId, visits) {
  let jobErrors = [];
  let jobResults = [];

  for (const visit of visits) {
    const storeId = visit.store_id;
    if (!storeMaster[storeId]) {
      jobErrors.push({
        store_id: storeId,
        error: "Store not found in Store Master",
      });
      continue;
    }

    for (const imageUrl of visit.image_url) {
      try {
        const perimeter = await processImage(imageUrl);
        jobResults.push({
          store_id: storeId,
          store_name: storeMaster[storeId].store_name,
          image_url: imageUrl,
          perimeter: perimeter,
        });
        console.log(
          `Processed image for store ${storeId}: Perimeter = ${perimeter}`
        );
      } catch (err) {
        jobErrors.push({ store_id: storeId, error: err.message });
      }
    }
  }

  jobs[jobId].status = jobErrors.length > 0 ? "failed" : "completed";
  jobs[jobId].errors = jobErrors;
  jobs[jobId].results = jobResults;
}

app.post("/api/submit/", (req, res) => {
  const { count, visits } = req.body;
  if (!visits || count === undefined || count !== visits.length) {
    return res.status(400).json({
      error: "Count does not match number of visits or missing fields",
    });
  }

  const jobId = uuidv4();
  jobs[jobId] = { status: "ongoing", errors: [], results: [] };

  processJob(jobId, visits)
    .then(() => console.log(`Job ${jobId} processed`))
    .catch((err) => console.error(`Error processing job ${jobId}:`, err));

  res.status(201).json({ job_id: jobId });
});
app.get("/api/status", (req, res) => {
  const jobId = req.query.jobid;
  if (!jobId || !jobs[jobId]) {
    return res.status(400).json({});
  }

  const jobInfo = jobs[jobId];
  const response = {
    job_id: jobId,
    status: jobInfo.status,
    ...(jobInfo.status === "failed" && { error: jobInfo.errors }),
    ...(jobInfo.status === "completed" && { results: jobInfo.results }),
  };

  res.status(200).json(response);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
