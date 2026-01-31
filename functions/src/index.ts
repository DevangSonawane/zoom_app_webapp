import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
 * Temporary auth callback endpoint for testing OAuth/redirect-based auth.
 * Does NOT perform real auth verification — for testing only.
 * Public GET endpoint with basic CORS support.
 */
export const authCallback = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  (req, res) => {
    // Only allow GET
    if (req.method !== "GET") {
      res.status(405).json({
        success: false,
        message: "Method Not Allowed",
        receivedParams: {},
      });
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;

    const receivedParams: Record<string, string | undefined> = {};
    if (code !== undefined) receivedParams.code = code;
    if (state !== undefined) receivedParams.state = state;
    if (error !== undefined) receivedParams.error = error;

    logger.info("Auth callback received", { code: code ?? null, state: state ?? null, error: error ?? null });

    res.status(200).json({
      success: true,
      message: "Auth callback received",
      receivedParams,
    });
  }
);
