export const aiApi = Object.freeze({
  status(authenticatedRequest) {
    return authenticatedRequest("/ai/status");
  },
  structureRequest(authenticatedRequest, input) {
    return authenticatedRequest("/ai/request-structure", {
      method: "POST",
      body: input,
    });
  },
});
