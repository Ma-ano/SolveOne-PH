import { createNotificationController } from "../controllers/notification.controller.js";
import { NotificationRepository } from "../repositories/notification.repository.js";
import { createNotificationRouter } from "../routes/notification.routes.js";
import { NotificationService } from "../services/notification.service.js";
import { notificationSchemas } from "../validators/notification.schemas.js";

export function createNotificationModule(authService, publisher) {
  const notificationService = new NotificationService({
    repository: new NotificationRepository(),
    publisher,
  });
  const notificationRouter = createNotificationRouter({
    controller: createNotificationController(notificationService),
    schemas: notificationSchemas,
    authService,
  });
  return Object.freeze({ notificationRouter, notificationService });
}
