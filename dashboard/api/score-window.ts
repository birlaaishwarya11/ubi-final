import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import * as ort from "onnxruntime-node";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SCORE_WORKER_SECRET = process.env.SCORE_WORKER_SECRET!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Resolve paths relative to this file so the bundle layout is the same
// locally, in `vercel dev`, and in deployed serverless functions.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = path.join(HERE, "_model");
const SCHEMA_PATH = path.join(BUNDLE_DIR, "feature_schema.json");

type Axis = {
  name: string;
  source: string;
  unit?: string;
  placeholder_value?: number;
  placeholder_note?: string;
};

type Schema = {
  model_version: string;
  model_file: string;
  input_name: string;
  output_name: string;
  output_kind: "classifier_softmax";
  axes: Axis[];
  normalization: null | { mean: number[]; std: number[] };
};

let schema: Schema | null = null;
let session: ort.InferenceSession | null = null;
let loadError: string | null = null;

async function loadOnce() {
  if (session && schema) return;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")) as Schema;
    const modelPath = path.join(BUNDLE_DIR, schema.model_file);
    if (!fs.existsSync(modelPath)) {
      loadError = `model file not bundled at api/_model/${schema.model_file}`;
      return;
    }
    session = await ort.InferenceSession.create(modelPath);
    loadError = null;
  } catch (e) {
    loadError = (e as Error).message;
  }
}

type WebhookPayload = {
  type: "INSERT";
  table: "sensor_windows";
  record: { window_id: number; user_id: string };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // Supabase webhooks send custom headers as configured in Studio. We use
  // x-score-worker-secret to authenticate the call.
  const auth = (req.headers["x-score-worker-secret"] ?? "") as string;
  if (auth !== SCORE_WORKER_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  await loadOnce();
  if (!schema) {
    return res.status(500).json({ error: "schema_load_failed", detail: loadError });
  }
  if (!session) {
    return res.status(503).json({ error: "model_not_ready", detail: loadError });
  }

  const payload = req.body as WebhookPayload;
  const windowId = payload?.record?.window_id;
  const userId = payload?.record?.user_id;
  if (typeof windowId !== "number" || typeof userId !== "string") {
    return res.status(400).json({ error: "bad_payload" });
  }

  const { data: row, error: viewErr } = await supabase
    .from("feature_vectors")
    .select("*")
    .eq("window_id", windowId)
    .maybeSingle();

  if (viewErr) return res.status(500).json({ error: "feature_lookup_failed", detail: viewErr.message });
  if (!row) return res.status(404).json({ error: "window_not_found", window_id: windowId });

  const features: number[] = [];
  for (const axis of schema.axes) {
    let v: number | null;
    if (axis.source === "PLACEHOLDER") {
      v = axis.placeholder_value ?? null;
    } else {
      v = mapAxisToFeature(axis.source, row);
    }
    if (v == null || Number.isNaN(v)) {
      // Sensor channel missing or quality flag tripped. Skip scoring rather
      // than feed a fake value: the dashboard already shows "—" for windows
      // without a matching `inferences` row.
      return res.status(200).json({ skipped: "incomplete_features", axis: axis.name });
    }
    features.push(v);
  }

  if (schema.normalization) {
    const { mean, std } = schema.normalization;
    for (let i = 0; i < features.length; i++) {
      features[i] = (features[i] - mean[i]) / (std[i] || 1);
    }
  }

  const tensor = new ort.Tensor("float32", Float32Array.from(features), [1, features.length]);
  const out = await session.run({ [schema.input_name]: tensor });
  const probs = (out[schema.output_name].data as Float32Array);
  if (probs.length !== 2) {
    return res.status(500).json({ error: "unexpected_output_shape", got: probs.length });
  }

  const probInflamed = probs[1];
  const immuneScore = Math.max(0, Math.min(100, probInflamed * 100));
  const riskLabel = probInflamed >= 0.5 ? 1 : 0;

  const { error: insErr } = await supabase
    .from("inferences")
    .insert({
      window_id: windowId,
      user_id: userId,
      immune_score: Number(immuneScore.toFixed(1)),
      risk_label: riskLabel,
      model_version: schema.model_version,
    });

  if (insErr) {
    // Same window webhooked twice → pkey on window_id collides with 23505.
    // That's success: we already scored it.
    if ((insErr as { code?: string }).code === "23505") {
      return res.status(200).json({ already_scored: windowId });
    }
    return res.status(500).json({ error: "inference_insert_failed", detail: insErr.message });
  }

  return res.status(201).json({
    window_id: windowId,
    immune_score: Number(immuneScore.toFixed(1)),
    risk_label: riskLabel,
    model_version: schema.model_version,
  });
}

function mapAxisToFeature(source: string, row: Record<string, unknown>): number | null {
  // source is dotted: "sensor_windows.skin_temp_c" → look up "skin_temp_c" on
  // the feature_vectors row (which already joins sensor_windows + profiles).
  const col = source.split(".").pop() ?? source;
  const v = row[col];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
