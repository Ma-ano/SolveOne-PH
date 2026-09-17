export const aiApi = Object.freeze({
  structureRequest(authenticatedRequest, input) {
    return authenticatedRequest("/ai/request-structure", {
      method: "POST",
      body: input,
    });
  },
});
