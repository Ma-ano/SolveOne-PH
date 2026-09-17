function serializeLocation(location, { includeBarangay }) {
  const serialized = {
    country: location?.country ?? null,
    province: location?.province ?? null,
    city: location?.city ?? null,
  };

  if (includeBarangay) {
    serialized.barangay = location?.barangay ?? null;
  }

  return serialized;
}

export function serializePrivateUser(user) {
  return {
    id: String(user._id ?? user.id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    bio: user.bio ?? null,
    skills: Array.isArray(user.skills) ? [...user.skills] : [],
    location: serializeLocation(user.location, { includeBarangay: true }),
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function serializePublicUser(user) {
  const lastInitial = user.lastName?.trim().charAt(0);

  return {
    id: String(user._id ?? user.id),
    displayName: lastInitial
      ? `${user.firstName} ${lastInitial.toLocaleUpperCase("en")}.`
      : user.firstName,
    bio: user.bio ?? null,
    skills: Array.isArray(user.skills) ? [...user.skills] : [],
    location: serializeLocation(user.location, { includeBarangay: false }),
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
    createdAt: user.createdAt,
  };
}
