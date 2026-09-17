import { z } from "zod";

import {
  MAX_DONATION_CENTAVOS,
  MIN_DONATION_CENTAVOS,
} from "../models/PlatformDonation.js";

export const donationSchemas = Object.freeze({
  checkout: {
    body: z
      .object({
        amountCentavos: z
          .number()
          .int()
          .min(MIN_DONATION_CENTAVOS)
          .max(MAX_DONATION_CENTAVOS),
      })
      .strict(),
  },
  history: {
    query: z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().max(500).optional(),
      })
      .strict(),
  },
});
