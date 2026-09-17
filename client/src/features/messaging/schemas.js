import { z } from "zod";

export const messageFormSchema = z.object({
  content: z.string().trim().min(1, "Write a message first").max(2000),
});
