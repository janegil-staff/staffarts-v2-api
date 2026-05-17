import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned in queries by default
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: 50,
    },

    // Optional profile fields, filled later from the profile screen
    bio: { type: String, default: '', maxlength: 500 },
    avatarUrl: { type: String, default: null },
    location: { type: String, default: '', maxlength: 100 },

    // Behaviour flags. Everyone is a collector by default. isArtist flips
    // to true when the user uploads their first artwork.
    isArtist: { type: Boolean, default: false },
    isCollector: { type: Boolean, default: true },

    // Refresh token storage with grace-period support.
    // currentRefreshToken is the latest issued token.
    // previousRefreshToken is the one it replaced; valid for REFRESH_GRACE_SECONDS.
    // previousRefreshExpiresAt is when the grace ends; null if no previous token.
    currentRefreshToken: { type: String, default: null, select: false },
    previousRefreshToken: { type: String, default: null, select: false },
    previousRefreshExpiresAt: { type: Date, default: null, select: false },

    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Hash password before save if it's new or changed.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method: check a plaintext password against this user's hash.
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Strip sensitive fields from JSON output (when sending to client).
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.currentRefreshToken;
  delete obj.previousRefreshToken;
  delete obj.previousRefreshExpiresAt;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;