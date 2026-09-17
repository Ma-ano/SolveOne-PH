export function createUserController(userService) {
  return Object.freeze({
    async getMe(req, res) {
      const result = await userService.getPrivateProfile(req.auth.userId);
      res.status(200).json({ success: true, data: result });
    },

    async updateMe(req, res) {
      const result = await userService.updatePrivateProfile(
        req.auth.userId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },

    async getPublicProfile(req, res) {
      const result = await userService.getPublicProfile(
        req.validated.params.userId,
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
