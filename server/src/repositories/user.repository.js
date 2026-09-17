import { User } from "../models/User.js";

export class UserRepository {
  async findPrivateUserById(userId) {
    return User.findOne({ _id: userId, accountStatus: "active" }).lean().exec();
  }

  async findActivePublicUserById(userId) {
    return User.findOne({ _id: userId, accountStatus: "active" }).lean().exec();
  }

  async updateUserProfile(userId, changes, now) {
    return User.findOneAndUpdate(
      { _id: userId, accountStatus: "active" },
      { $set: { ...changes, updatedAt: now } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }
}
