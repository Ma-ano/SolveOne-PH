import { createUserController } from "../controllers/user.controller.js";
import { UserRepository } from "../repositories/user.repository.js";
import { createUserRouter } from "../routes/user.routes.js";
import { UserService } from "../services/user.service.js";

export function createUserModule(authService) {
  const repository = new UserRepository();
  const userService = new UserService({ repository });
  const userController = createUserController(userService);
  const userRouter = createUserRouter({ userController, authService });

  return Object.freeze({ userRouter, userService });
}
