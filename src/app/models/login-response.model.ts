export interface LoginResponse {

  token: string;
  username: string;
  role: 'ADMIN' | 'PILOT' | 'OPERATOR';
  
}