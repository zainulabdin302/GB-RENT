# GB Rent — AI microservice

A standalone **Bun + TypeScript** microservice on port `3003` that powers the
two AI features of GB Rent:

| Endpoint | Purpose | Algorithm |
|---|---|---|
| `GET  /api/health` | Liveness + model metadata | — |
| `POST /api/predict-price` | Suggest a fair monthly rent for a listing | **RandomForestRegressor** (30 trees) |
| `POST /api/similar` | Find the k most similar listings to a target | **k-NN with cosine similarity** |

The service is **self-contained** — it has its own `package.json`, no
dependency on the Next.js project, no Prisma, no `z-ai-web-dev-sdk`. It is
started in the background and called server-to-server by the Next.js
backend (`src/lib/ai-client.ts`). Browsers never talk to it directly.

---

## (a) Why TypeScript and not Python?

The architecture brief asked for a *"Python FastAPI + scikit-learn"* AI
service. We deliver the same algorithms in TypeScript instead, for three
practical FYP reasons:

1. **Single language across the stack.** The frontend, backend and AI
   service share one language, one type system and one packaging tool
   (`bun`). Less context-switching for the team, fewer CI pipelines.
2. **Zero new runtime.** A `bun` process is already running the Next.js
   project, so the AI service is just another `bun --hot index.ts` — no
   Python venv, no `pip install`, no second interpreter on the box.
3. **Type-safety for the ML contract.** The request/response DTOs are
   `interface`s, so a breaking change in `PricePredictionRequest`
   surfaces as a compile error before the service starts.

We deliberately did **not** use `scikit-learn` (or any TS ML lib) because
the dataset is small (250 rows) and the algorithms are pedagogical —
hand-rolling a CART tree, a Random Forest and a cosine k-NN inside ~600
lines of TS gives an answerable FYP defense ("show me the split logic")
without hiding behind a black-box library.

## (b) The REST contract is identical → production-swappable

The HTTP contract is **language-agnostic**:

```
POST /api/predict-price   { type, cityZone, area, rooms, size, amenities }
  → 200 { predictedPrice, low, high, confidence, features, explanation }

POST /api/similar         { propertyId, candidates[], target, k? }
  → 200 { matches[], method }
```

Both this service and a hypothetical Python FastAPI service can serve
that contract. To swap implementations in production the Next.js backend
only needs to change **one URL** in `src/lib/ai-client.ts`:

```ts
const AI_URL = "http://localhost:3003";   // TS microservice
// const AI_URL = "http://localhost:8000"; // Python FastAPI equivalent
```

Nothing else in the project changes — the DTOs in `src/types/index.ts`
already match both implementations.

## (c) RandomForestRegressor — the math

A Random Forest is two sources of randomness stacked on top of a bagged
ensemble of decision trees:

1. **Bagging** — each of the N=30 trees is fitted on its own *bootstrap
   sample*: n rows drawn with replacement from the 250 training rows.
   ~63 % of rows are unique per sample, the other ~37 % are out-of-bag
   (we use these for an honest OOB R² estimate).
2. **Random subspace method** — at every split inside every tree only
   `maxFeatures = ⌊√26⌋ = 5` randomly chosen features are candidate
   splitters. This prevents the dominant `size` column from being
   selected at the top of every tree — that is what makes a Random
   Forest actually different from a plain bagged ensemble.

Each tree is a **CART regression tree**. At every node we minimise the
weighted child MSE

$$
\text{child-mse}(s) = \frac{n_L}{n}\,\overline{(y_L - \bar{y}_L)^2} + \frac{n_R}{n}\,\overline{(y_R - \bar{y}_R)^2}
$$

by scanning candidate thresholds (midpoints of consecutive unique values
per feature — collapses to a single `0.5` threshold for binary one-hot
columns). Stop conditions: `maxDepth=8`, `minSamplesSplit=4`,
`minSamplesLeaf=2`. Leaf value = arithmetic mean of `y` at that leaf.

Forest prediction is the **mean** of all 30 trees:

$$
\hat{y}(x) = \frac{1}{N}\sum_{b=1}^{N} T_b(x)
$$

Feature importance is the regression analogue of Gini importance:
average over trees of the sum, across all internal nodes that split on
feature *f*, of `(n_node / N_total) × (mse_parent − mse_child)`, then
L1-normalised so the importances sum to 1.

## (d) Cosine k-NN — the math

For "find similar listings" we use a 27-dim feature vector (24 one-hot /
binary categorical + 3 normalised numeric: `rooms/6`, `size/2000`,
`price/100000`). Price **is** a feature here because two listings at the
same asking price are more "similar" than two at very different prices —
unlike the forest where price is the *target*.

Cosine similarity between two non-negative vectors `a`, `b`:

$$
\cos(a, b) = \frac{a \cdot b}{\|a\|\,\|b\|} \in [0, 1]
$$

Distance is `1 − similarity`. The endpoint returns the top-`k` (default 5)
candidates sorted by similarity descending.

Because all our features are non-negative, cosine is effectively a *soft
overlap coefficient*: two listings that share their type, zone and most
amenities — plus a comparable size and price — rise to the top.

## Confidence heuristic (documented)

After the forest predicts a price for a query, we substitute that
predicted price as the price dimension of the similarity vector and
count how many of the 250 training rows have cosine similarity `> 0.85`
to the query. Let this be `nNear`. Confidence is

$$
\text{confidence} = \min(1,\; nNear / 15)
$$

15 was chosen so that, with 250 listings spread across 10 zones × 4
types ≈ 6 listings per bucket, a typical query lands in the 0.4–1.0
confidence band. Under-populated buckets return lower confidence, which
the UI can surface as *"low confidence — fewer comparable listings in
this area."*

## Files

```
mini-services/ai-service/
├── package.json
├── index.ts                 # Bun.serve HTTP server + model bootstrap
├── ml/
│   ├── types.ts             # local DTO copy (independent of Next.js)
│   ├── preprocessing.ts     # one-hot / binary / numeric feature vectors
│   ├── decision-tree.ts     # CART regressor (weighted-MSE splits)
│   ├── random-forest.ts     # RandomForestRegressor + featureImportances + OOB
│   ├── knn.ts               # cosine similarity k-NN
│   └── training-data.ts     # 250 synthetic GB listings + trainModels() + predictPrice()
└── README.md                # this file
```

## Run

```bash
cd mini-services/ai-service
bun install 2>/dev/null
bun run dev    # bun --hot index.ts  →  http://localhost:3003
```

Health check:

```bash
curl -s http://localhost:3003/api/health
# {"ok":true,"models":{"forest":30,"trained":true}, ...}
```

Sample prediction (a furnished 3-room house in Hunza, 900 sqft):

```bash
curl -s -X POST http://localhost:3003/api/predict-price \
  -H "Content-Type: application/json" \
  -d '{"type":"HOUSE","cityZone":"Hunza","area":"Karimabad","rooms":3,
       "size":900,"amenities":["FURNISHED","WATER","PARKING"]}'
```
