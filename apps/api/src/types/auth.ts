export type AuthenticatedUser = {
  id: string;
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
  getOwnProfile(token: string, userId: string): Promise<Profile | null>;
}
