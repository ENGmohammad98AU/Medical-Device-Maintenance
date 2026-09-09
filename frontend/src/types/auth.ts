export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name: string;
  phone?: string;
  department?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  phone?: string;
  department?: string;
  created_at: string;
  updated_at: string;
}

export enum UserRole {
  ADMINISTRATOR = "administrator",
  BIOMEDICAL_ENGINEER = "biomedical_engineer",
  MEDICAL_TECHNICIAN = "medical_technician",
  DOCTOR = "doctor",
  NURSE = "nurse"
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
