export type AuthenticatedUser = {
  id: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
};

export interface AuthGateway {
  verifyAccessToken(token: string): Promise<AuthenticatedUser | null>;
  refreshSession(refreshToken: string): Promise<AuthSession | null>;
  revokeSession(accessToken: string): Promise<void>;
  getOwnProfile(token: string, userId: string): Promise<Profile | null>;
}
