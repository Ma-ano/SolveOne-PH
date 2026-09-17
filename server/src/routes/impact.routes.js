import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../middleware/validateRequest.js";
import { ImpactRepository } from "../repositories/impact.repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";

export function createImpactRouter(repository = new ImpactRepository()) {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res
        .status(200)
        .json({ success: true, data: { impact: await repository.platform() } });
    }),
  );
  router.get(
    "/users/:userId",
    validateRequest({
      params: z
        .object({ userId: z.string().regex(/^[0-9a-fA-F]{24}$/) })
        .strict(),
    }),
    asyncHandler(async (req, res) => {
      const impact = await repository.forUser(req.validated.params.userId);
      if (!impact)
        throw new AppError({
          statusCode: 404,
          code: "USER_NOT_FOUND",
          message: "User not found",
        });
      res.status(200).json({ success: true, data: { impact } });
    }),
  );
  return router;
}
