export type AuthenticatedUser = {
  id: string;
  email?: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
};

export type LoginResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "invalid_credentials" }
  | { status: "email_not_confirmed" };

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
  signUpWithPassword(input: {
    displayName: string;
    email: string;
    password: string;
  }): Promise<void>;
  confirmSignup(email: string, token: string): Promise<boolean>;
  resendSignupConfirmation(email: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<LoginResult>;
  getOwnProfile(token: string, userId: string): Promise<Profile | null>;
}
