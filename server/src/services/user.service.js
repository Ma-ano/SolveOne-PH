import {
  serializePrivateUser,
  serializePublicUser,
} from "../serializers/user.serializer.js";
import { AppError } from "../utils/AppError.js";

const editableProfileFields = Object.freeze([
  "firstName",
  "lastName",
  "bio",
  "skills",
  "location",
]);
const locationFields = Object.freeze([
  "country",
  "province",
  "city",
  "barangay",
]);

function notFound() {
  return new AppError({
    statusCode: 404,
    code: "USER_NOT_FOUND",
    message: "User not found",
  });
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) {
    return skills;
  }

  const seen = new Set();
  return skills.filter((skill) => {
    const key = skill.toLocaleLowerCase("en");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function pickLocation(location) {
  if (location === null) {
    return null;
  }

  return Object.fromEntries(
    locationFields
      .filter((field) => Object.hasOwn(location, field))
      .map((field) => [field, location[field]]),
  );
}

export class UserService {
  constructor({ repository, clock = () => new Date() }) {
    this.repository = repository;
    this.clock = clock;
  }

  async getPrivateProfile(userId) {
    const user = await this.repository.findPrivateUserById(userId);

    if (!user) {
      throw notFound();
    }

    return { user: serializePrivateUser(user) };
  }

  async updatePrivateProfile(userId, input) {
    const changes = Object.fromEntries(
      editableProfileFields
        .filter((field) => Object.hasOwn(input, field))
        .map((field) => [field, input[field]]),
    );

    if (Object.hasOwn(changes, "skills")) {
      changes.skills = normalizeSkills(changes.skills);
    }

    if (Object.hasOwn(changes, "location")) {
      changes.location = pickLocation(changes.location);
    }

    const user = await this.repository.updateUserProfile(
      userId,
      changes,
      this.clock(),
    );

    if (!user) {
      throw notFound();
    }

    return { user: serializePrivateUser(user) };
  }

  async getPublicProfile(userId) {
    const user = await this.repository.findActivePublicUserById(userId);

    if (!user) {
      throw notFound();
    }

    return { user: serializePublicUser(user) };
  }
}
