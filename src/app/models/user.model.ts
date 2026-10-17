export interface User {

  username: string;
  role: 'ADMIN' | 'PILOT' | 'OPERATOR';
  token?: string;
  
}