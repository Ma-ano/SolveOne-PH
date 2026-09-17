import { z } from "zod";

const moneyPattern = /^\d{1,9}(?:\.\d{1,2})?$/;

export const offerFormSchema = z
  .object({
    helpType: z.enum(["money", "item", "skill", "time"]),
    message: z.string().trim().min(10).max(1000),
    quantity: z.string().trim(),
    pledgedValuePesos: z.string().trim(),
    estimatedMinutes: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.helpType === "money") {
      if (
        !moneyPattern.test(values.pledgedValuePesos) ||
        Number(values.pledgedValuePesos) <= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["pledgedValuePesos"],
          message: "Enter a positive PHP pledge with up to two decimals",
        });
      }
      return;
    }

    if (!/^\d+$/.test(values.quantity) || Number(values.quantity) < 1) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Enter a whole-number quantity of at least 1",
      });
    }
    if (
      ["skill", "time"].includes(values.helpType) &&
      (!/^\d+$/.test(values.estimatedMinutes) ||
        Number(values.estimatedMinutes) < 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["estimatedMinutes"],
        message: "Enter the estimated whole number of minutes",
      });
    }
  });

function pesosToCentavos(value) {
  const [pesos, centavos = ""] = value.split(".");
  return Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
}

export function offerFormToPayload(values, needItemId) {
  const common = {
    needItemId,
    helpType: values.helpType,
    message: values.message.trim(),
  };
  if (values.helpType === "money") {
    return {
      ...common,
      pledgedValueCentavos: pesosToCentavos(values.pledgedValuePesos),
    };
  }
  if (values.helpType === "item") {
    return { ...common, quantity: Number(values.quantity) };
  }
  return {
    ...common,
    quantity: Number(values.quantity),
    estimatedMinutes: Number(values.estimatedMinutes),
  };
}

export function emptyOfferForm(helpType = "item") {
  return {
    helpType,
    message: "",
    quantity: "1",
    pledgedValuePesos: "",
    estimatedMinutes: "60",
  };
}
